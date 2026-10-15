/**
 * Embedded Signup — parte do navegador.
 *
 * Funções puras, para o comportamento do fluxo ser testável sem o SDK do
 * Facebook: montar as opções do `FB.login` e interpretar a mensagem que o SDK
 * posta ao terminar. Formatos conforme COEXISTENCE.md do repositório de
 * referência; os campos marcados [VERIFICAR] não foram exercitados contra a Meta.
 */

export interface OpcoesDoLogin {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: { setup: Record<string, never>; featureType?: string; sessionInfoVersion: "3" };
}

/**
 * `coexistencia: true` usa o fluxo do app WhatsApp Business (o número continua
 * no celular). Sem ele, o fluxo padrão de número só da API.
 */
export function opcoesDoLogin(p: { configId: string; coexistencia: boolean }): OpcoesDoLogin {
  return {
    config_id: p.configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      ...(p.coexistencia ? { featureType: "whatsapp_business_app_onboarding" } : {}),
      sessionInfoVersion: "3",
    },
  };
}

export type MensagemDoSignup =
  | { tipo: "concluido"; wabaId: string; phoneNumberId: string | null }
  | { tipo: "cancelado"; etapa: string | null }
  | { tipo: "erro"; texto: string }
  | { tipo: "ignorada" };

/** Só aceita mensagens que vêm de um domínio do Facebook. */
export function origemConfiavel(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === "facebook.com" || h.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

/**
 * O SDK posta `{ type: "WA_EMBEDDED_SIGNUP", event, data }` (às vezes como
 * string JSON). Qualquer outra coisa é ignorada — a janela recebe mensagem de
 * extensões e de outros scripts da página.
 */
export function lerMensagemDoSignup(origin: string, bruto: unknown): MensagemDoSignup {
  if (!origemConfiavel(origin)) return { tipo: "ignorada" };

  let m: unknown = bruto;
  if (typeof bruto === "string") {
    try {
      m = JSON.parse(bruto);
    } catch {
      return { tipo: "ignorada" };
    }
  }
  if (!m || typeof m !== "object") return { tipo: "ignorada" };
  const o = m as { type?: unknown; event?: unknown; data?: unknown };
  if (o.type !== "WA_EMBEDDED_SIGNUP") return { tipo: "ignorada" };

  const data = (o.data && typeof o.data === "object" ? o.data : {}) as Record<string, unknown>;
  const evento = String(o.event ?? "");

  if (evento.startsWith("FINISH")) {
    const waba = typeof data.waba_id === "string" ? data.waba_id : null;
    if (!waba) return { tipo: "erro", texto: "A Meta não informou a conta do WhatsApp (waba_id)." };
    return {
      tipo: "concluido",
      wabaId: waba,
      phoneNumberId: typeof data.phone_number_id === "string" ? data.phone_number_id : null,
    };
  }
  if (evento === "CANCEL") {
    return {
      tipo: "cancelado",
      etapa: typeof data.current_step === "string" ? data.current_step : null,
    };
  }
  if (evento === "ERROR") {
    return {
      tipo: "erro",
      texto:
        typeof data.error_message === "string" ? data.error_message : "A Meta devolveu um erro.",
    };
  }
  return { tipo: "ignorada" };
}
