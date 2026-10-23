/**
 * Avaliação do atendimento (CSAT) por WhatsApp: o cliente responde a pesquisa com uma nota de 1 a 5.
 *
 * Só conta a mensagem INTEIRA ("5", "5.", "4!"): "5 minutos depois" ou "tenho 2 perguntas" não
 * são nota. A mesma regra existe no gatilho do banco (`wa_disparar_automacao_de_mensagem`), para a
 * nota não disparar resposta automática. Mexeu aqui, mexa lá.
 */
const NOTA = /^\s*([1-5])[\s.!]*$/;

export function notaDeAvaliacao(texto: string | null | undefined): number | null {
  const m = texto ? NOTA.exec(texto) : null;
  return m ? Number(m[1]) : null;
}

/** A pesquisa vale por 48 h; depois disso um "5" qualquer deixa de ser resposta a ela. */
export const VALIDADE_DA_PESQUISA_MS = 48 * 60 * 60 * 1000;

export const TEXTO_PADRAO_DA_PESQUISA =
  "Como foi o seu atendimento? Responda com uma nota de 1 (ruim) a 5 (ótimo).";

export function pesquisaEmAberto(
  conversa: { csat_requested_at: string | null; csat_score: number | null },
  agora: Date = new Date(),
): boolean {
  if (!conversa.csat_requested_at || conversa.csat_score != null) return false;
  const pedido = Date.parse(conversa.csat_requested_at);
  return Number.isFinite(pedido) && agora.getTime() - pedido <= VALIDADE_DA_PESQUISA_MS;
}
