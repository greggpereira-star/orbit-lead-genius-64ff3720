/**
 * Catálogo dos recursos que dependem de plano.
 *
 * Este arquivo só ROTULA. Quem decide o que cada plano inclui é a tabela `plans`
 * (dado, editável sem deploy). Aqui ficam o nome de cada chave para a tela e a
 * lista das chaves que o código conhece: uma chave fora daqui nunca é consultada.
 *
 * Só entram recursos NOVOS e vendidos por plano. Funcionalidade que já existia
 * antes dos planos não pode aparecer aqui, ou a introdução da camada tiraria algo
 * de quem já usa.
 */
export type ChaveDeRecurso =
  | "api_publica"
  | "webhooks_assinados"
  | "ia_classificacao"
  | "ia_limite_mensal";

export interface DefinicaoDeRecurso {
  chave: ChaveDeRecurso;
  rotulo: string;
  descricao: string;
  /** `limite` mostra o número; `liga` mostra incluído/não incluído. */
  tipo: "liga" | "limite";
  /** Chave "liga" cujo plano precisa estar ativo para o limite fazer sentido. */
  depende?: ChaveDeRecurso;
}

export const RECURSOS: readonly DefinicaoDeRecurso[] = [
  {
    chave: "api_publica",
    rotulo: "API pública",
    descricao: "Integre o funil a outros sistemas com chave de acesso própria.",
    tipo: "liga",
  },
  {
    chave: "webhooks_assinados",
    rotulo: "Webhooks de saída assinados",
    descricao: "Receba eventos do funil em tempo real, com assinatura para validar a origem.",
    tipo: "liga",
  },
  {
    chave: "ia_classificacao",
    rotulo: "Classificação por IA",
    descricao: "A IA lê a conversa e sugere a etapa do lead, com justificativa.",
    tipo: "liga",
  },
  {
    chave: "ia_limite_mensal",
    rotulo: "Conversas analisadas por mês",
    descricao: "Teto mensal de análises da IA incluído no plano.",
    tipo: "limite",
    depende: "ia_classificacao",
  },
] as const;

export type ValorDeRecurso = boolean | number | null | undefined;

/** Incluído = `true` ou um limite maior que zero. Ausente é "não incluído". */
export function estaIncluido(valor: ValorDeRecurso): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor > 0;
  return false;
}

/** Texto curto do valor para a tabela do plano. */
export function textoDoValor(def: DefinicaoDeRecurso, valor: ValorDeRecurso): string {
  if (def.tipo === "limite") {
    return typeof valor === "number" && valor > 0 ? valor.toLocaleString("pt-BR") : "—";
  }
  return estaIncluido(valor) ? "Incluído" : "Não incluído";
}
