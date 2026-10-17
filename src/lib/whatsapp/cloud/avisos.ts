/**
 * "Avisos da Meta": eventos da conta que o sistema recebe mas NÃO trata sozinho
 * (violação, restrição, mudança de qualidade…). Antes eram descartados em silêncio
 * e o time só descobria quando o envio parava.
 *
 * Os nomes reais dos eventos da Meta são [VERIFICAR]: por isso a lista mostra o
 * nome TAL COMO CHEGOU e não traduz o que não conhece. A gravidade é uma pista
 * pelo nome, não um fato da Meta.
 */

/** Eventos de `account_update` que o processador já trata (não são "aviso"). */
export const EVENTOS_DE_CONTA_TRATADOS: ReadonlySet<string> = new Set([
  "PARTNER_REMOVED",
  "ACCOUNT_OFFBOARDED",
  "ACCOUNT_RECONNECTED",
]);

export interface EventoGuardado {
  id: string;
  field: string;
  received_at: string;
  phone_number_id: string | null;
  payload: Record<string, unknown>;
}

export interface AvisoDaMeta {
  id: string;
  quando: string;
  /** `alta` quando o nome sugere problema na conta; `info` no resto. */
  gravidade: "alta" | "info";
  titulo: string;
  detalhe: string | null;
}

const PISTA_DE_PROBLEMA = /VIOLAT|RESTRICT|BAN|DISABLE|FLAG|SUSPEND|REJECT|DELET|BLOCK|LIMIT/i;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Filtra os eventos guardados e monta a lista. `wabas`/`numeros` são os da
 * EMPRESA da sessão: evento de outra conta nunca aparece.
 */
export function montarAvisos(
  eventos: readonly EventoGuardado[],
  empresa: { wabas: readonly string[]; numeros: readonly string[] },
): AvisoDaMeta[] {
  const wabas = new Set(empresa.wabas);
  const numeros = new Set(empresa.numeros);
  const avisos: AvisoDaMeta[] = [];

  for (const e of eventos) {
    const p = e.payload ?? {};
    if (e.field === "conta") {
      const evento = texto(p.evento)?.toUpperCase();
      const waba = texto(p.wabaId);
      if (!evento || !waba || !wabas.has(waba)) continue;
      if (EVENTOS_DE_CONTA_TRATADOS.has(evento)) continue;
      avisos.push({
        id: e.id,
        quando: e.received_at,
        gravidade: PISTA_DE_PROBLEMA.test(evento) ? "alta" : "info",
        titulo: `Evento da conta: ${evento}`,
        detalhe: texto(p.motivo) ?? texto(p.displayPhone),
      });
    } else if (e.field === "ignorado") {
      const campo = texto(p.field);
      const chave = texto(p.dedupKey) ?? "";
      const daEmpresa =
        (e.phone_number_id && numeros.has(e.phone_number_id)) ||
        [...wabas].some((w) => chave.includes(`:${w}:`));
      if (!campo || !daEmpresa) continue;
      avisos.push({
        id: e.id,
        quando: e.received_at,
        gravidade: PISTA_DE_PROBLEMA.test(campo) ? "alta" : "info",
        titulo: `Notificação da Meta: ${campo}`,
        detalhe: resumoDoValor(p.payload),
      });
    }
  }
  return avisos.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30);
}

/** Resumo curto e seguro do conteúdo (nunca despeja o payload inteiro na tela). */
function resumoDoValor(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const partes: string[] = [];
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (["string", "number", "boolean"].includes(typeof val)) partes.push(`${k}: ${String(val)}`);
    if (partes.length >= 4) break;
  }
  const s = partes.join(" · ");
  return s ? (s.length > 160 ? `${s.slice(0, 159)}…` : s) : null;
}
