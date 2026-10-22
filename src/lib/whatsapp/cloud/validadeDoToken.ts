/**
 * Validade do token de acesso, lida do `debug_token` da Meta. Serve para dizer a data real em vez
 * de supor ("60 dias"): token de usuário do sistema pode ser permanente ou vencer; o de teste vence.
 */

export type NivelDeValidade = "ok" | "vence_logo" | "expirado" | "desconhecido";

export interface ValidadeDoToken {
  nivel: NivelDeValidade;
  rotulo: string;
  descricao: string;
  /** ISO da expiração; null = não expira (ou não informado). */
  expiraEm: string | null;
  tipo: string | null;
}

const DIA = 86_400_000;
const AVISO_EM_DIAS = 7;

const data = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");

/** `bruto` é o corpo do `debug_token` (`{ data: {...} }`) ou o próprio `data`. */
export function interpretarValidadeDoToken(
  bruto: Record<string, unknown> | null | undefined,
  agoraMs: number,
): ValidadeDoToken {
  const d = ((bruto?.data as Record<string, unknown> | undefined) ?? bruto ?? {}) as Record<
    string,
    unknown
  >;
  const tipo = typeof d.type === "string" ? d.type : null;
  if (typeof d.is_valid !== "boolean") {
    return {
      nivel: "desconhecido",
      rotulo: "Não consegui medir",
      descricao: "A Meta não informou a validade deste token.",
      expiraEm: null,
      tipo,
    };
  }
  const exp = typeof d.expires_at === "number" ? d.expires_at : 0; // 0 = sem expiração
  const expMs = exp > 0 ? exp * 1000 : null;
  const iso = expMs ? new Date(expMs).toISOString() : null;

  if (!d.is_valid) {
    const quando = expMs ? ` em ${data(expMs)}` : "";
    return {
      nivel: "expirado",
      rotulo: "Expirado ou revogado",
      descricao: `O token deixou de valer${quando}. Gere um token novo (no usuário do sistema, escolha a validade "Nunca", se aparecer) e reconecte o número.`,
      expiraEm: iso,
      tipo,
    };
  }
  if (expMs === null) {
    return {
      nivel: "ok",
      rotulo: "Não expira",
      descricao: "Este token não tem data de expiração.",
      expiraEm: null,
      tipo,
    };
  }
  const dias = Math.floor((expMs - agoraMs) / DIA);
  if (dias <= AVISO_EM_DIAS) {
    return {
      nivel: "vence_logo",
      rotulo: dias <= 0 ? "Vence hoje" : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`,
      descricao: `O token expira em ${data(expMs)}. Gere um novo antes disso para não interromper os envios.`,
      expiraEm: iso,
      tipo,
    };
  }
  return {
    nivel: "ok",
    rotulo: `Válido até ${data(expMs)}`,
    descricao: `Faltam ${dias} dias para o token expirar.`,
    expiraEm: iso,
    tipo,
  };
}
