/**
 * Cliente da Evolution API (WhatsApp não-oficial, protocolo do WhatsApp Web).
 *
 * A instância já roda na própria VPS; aqui só falamos HTTP com ela. Toda função
 * devolve um resultado tipado em vez de lançar, porque os chamadores são
 * disparos "fire and forget" no fluxo de criação de lead — uma falha de
 * WhatsApp nunca pode derrubar a gravação do lead.
 */

const BASE_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";

export function isEvolutionConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

export function evolutionBaseUrl(): string {
  return BASE_URL;
}

/**
 * "Tem variável de ambiente" não é o mesmo que "a API responde".
 *
 * Confundir os dois fazia a tela dizer que estava tudo certo enquanto o
 * endereço configurado sequer respondia — o usuário só descobria ao clicar em
 * conectar e receber um erro cru. Este ping separa as duas coisas e devolve
 * uma causa legível.
 */
export async function pingEvolution(): Promise<{ reachable: boolean; error?: string; version?: string }> {
  if (!isEvolutionConfigured()) {
    return { reachable: false, error: "EVOLUTION_API_URL / EVOLUTION_API_KEY não configuradas no servidor." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(`${BASE_URL}/`, {
      headers: { apikey: API_KEY },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { reachable: false, error: `A Evolution API respondeu ${res.status} em ${BASE_URL}.` };
    }
    const body = (await res.json().catch(() => null)) as { version?: string } | null;
    return { reachable: true, version: body?.version };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Causas comuns, traduzidas: certificado inválido, DNS, recusa de conexão.
    const friendly = /abort/i.test(raw)
      ? `Sem resposta de ${BASE_URL} (timeout).`
      : `Não foi possível alcançar ${BASE_URL} — ${raw}`;
    return { reachable: false, error: friendly };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EvolutionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Traduz o status para a causa provável.
 *
 * "Evolution 403" não diz a ninguém o que fazer. O status importa para quem lê
 * log; para quem está na tela, o que importa é se o problema é a chave, o
 * endereço, ou uma instância que não existe mais.
 */
function explicarStatus(status: number): string {
  if (status === 401) return "A Evolution recusou a chave de acesso (EVOLUTION_API_KEY).";
  if (status === 403) return "Alguma coisa entre o app e a Evolution bloqueou a chamada — confira se EVOLUTION_API_URL aponta para a Evolution e não para um proxy.";
  if (status === 404) return "A instância não existe mais na Evolution.";
  if (status === 502 || status === 503 || status === 504) return "A Evolution está fora do ar ou reiniciando.";
  return "A Evolution recusou a chamada.";
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<EvolutionResult<T>> {
  if (!isEvolutionConfigured()) {
    return { ok: false, error: "Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY)." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: API_KEY,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const detail =
        parsed && typeof parsed === "object"
          ? ((parsed as any).message ?? (parsed as any).error ?? JSON.stringify(parsed))
          : String(parsed ?? "");

      // Registrar a falha é o ponto todo desta mudança.
      //
      // Um "Evolution 403: Forbidden" apareceu na tela do usuário e não foi
      // possível descobrir de onde veio: o cliente não gravava nada, nem no
      // journal nem no last_error da instância. Sobrou reproduzir à mão cada
      // chamada — e nenhuma reproduziu, porque a Evolution devolve 200, 401 ou
      // 404, nunca 403. Sem registro, a única pista era uma captura de tela.
      //
      // Guarda o caminho e o status, nunca a apikey. `BASE_URL` entra porque a
      // hipótese mais difícil de descartar foi justamente estar apontando para
      // outro lugar que não a Evolution.
      console.error(
        JSON.stringify({
          scope: "evolution",
          msg: "chamada_falhou",
          method: init.method ?? "GET",
          path,
          base: BASE_URL,
          status: res.status,
          detail: String(detail).slice(0, 200),
        }),
      );

      return { ok: false, error: `${explicarStatus(res.status)} (Evolution ${res.status}: ${String(detail).slice(0, 200)})` };
    }

    return { ok: true, data: parsed as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message === "The operation was aborted." ? "Timeout na Evolution API." : message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Converte telefone brasileiro em JID do WhatsApp.
 *
 * Números do Meta Lead Ads chegam em formatos variados (+55 27 99631-8075,
 * 27996318075, 5527996318075). O WhatsApp espera só dígitos com DDI.
 * Retorna null quando o número não tem cara de telefone válido — melhor não
 * enviar do que enviar pra alguém errado.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;

  // Remove zeros de discagem nacional no começo (ex: 027...)
  digits = digits.replace(/^0+/, "");

  // Sem DDI: assume Brasil quando o tamanho bate com DDD + número.
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  // Com DDI brasileiro, aceitamos 12 (fixo) ou 13 (celular com o 9).
  if (digits.startsWith("55")) {
    const rest = digits.slice(2);
    if (rest.length < 10 || rest.length > 11) return null;
    return digits;
  }

  // Outros países: exige um tamanho plausível de E.164.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export interface CreateInstanceResult {
  instanceName: string;
  qrCodeBase64: string | null;
  pairingCode: string | null;
}

/**
 * Cria a instância e já devolve o QR code pro usuário parear o aparelho.
 * A Evolution retorna o QR em formatos ligeiramente diferentes conforme a
 * versão, então normalizamos aqui.
 */
export async function createInstance(
  instanceName: string,
  webhookUrl?: string,
): Promise<EvolutionResult<CreateInstanceResult>> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };

  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    };
  }

  const res = await call<any>("/instance/create", { method: "POST", body });
  if (!res.ok) return { ok: false, error: res.error };

  const d = res.data ?? {};
  const qr = d.qrcode ?? d.qrCode ?? {};
  return {
    ok: true,
    data: {
      instanceName,
      qrCodeBase64: qr.base64 ?? qr.code ?? null,
      pairingCode: qr.pairingCode ?? null,
    },
  };
}

/** Novo QR quando o anterior expira (a Evolution rotaciona a cada ~30s). */
export async function getQrCode(instanceName: string): Promise<EvolutionResult<{ qrCodeBase64: string | null }>> {
  const res = await call<any>(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const d = res.data ?? {};
  return { ok: true, data: { qrCodeBase64: d.base64 ?? d.code ?? null } };
}

export interface InstanceState {
  state: string;
  connected: boolean;
}

export async function getInstanceState(instanceName: string): Promise<EvolutionResult<InstanceState>> {
  const res = await call<any>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const state = res.data?.instance?.state ?? res.data?.state ?? "unknown";
  return { ok: true, data: { state, connected: state === "open" } };
}

export async function deleteInstance(instanceName: string): Promise<EvolutionResult<unknown>> {
  const logout = await call<unknown>(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  const removed = await call<unknown>(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  // Logout costuma falhar quando já estava desconectado; o que importa é o delete.
  return removed.ok ? removed : logout;
}

export interface SendTextResult {
  messageId: string | null;
}

export async function sendText(
  instanceName: string,
  toNumber: string,
  text: string,
): Promise<EvolutionResult<SendTextResult>> {
  const number = toWhatsAppNumber(toNumber);
  if (!number) return { ok: false, error: `Telefone inválido: ${toNumber}` };

  const res = await call<any>(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { number, text },
  });
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, data: { messageId: res.data?.key?.id ?? null } };
}
