import type { LinhaDeCusto } from "../services/adIntelligenceService";

/**
 * Apoio à leitura da tabela de anúncios.
 *
 * Nada aqui DECIDE por quem lê (pausar, escalar): só põe à vista o que muda a
 * confiança no número — quantos leads existem por trás de um custo — e deixa a pessoa
 * ordenar pelo critério dela.
 */

/** Regra prática, não garantia estatística: com menos leads que isso, custo e taxa balançam muito. */
export const AMOSTRA_MINIMA = 30;

export type ColunaOrdenavel =
  "gasto" | "leads" | "custo_lead" | "qualificados" | "custo_qualificado" | "taxa";
export type Direcao = "asc" | "desc";
export interface Ordem {
  coluna: ColunaOrdenavel;
  direcao: Direcao;
}

/** Colunas de CUSTO começam do menor (o mais barato primeiro); as demais, do maior. */
const COMECA_DO_MENOR: ReadonlySet<ColunaOrdenavel> = new Set(["custo_lead", "custo_qualificado"]);

export function valorDaColuna(l: LinhaDeCusto, coluna: ColunaOrdenavel): number | null {
  switch (coluna) {
    case "gasto":
      return l.gasto;
    case "leads":
      return l.conversas;
    case "custo_lead":
      return l.custo_por_lead;
    case "qualificados":
      // Sem régua o número não existe (a tela mostra "—"): ordenar por ele seria inventar.
      return l.taxa_qualificacao === null ? null : l.qualificados;
    case "custo_qualificado":
      return l.custo_por_qualificado;
    case "taxa":
      return l.taxa_qualificacao;
  }
}

/** Ordena sem alterar a lista original. Valor ausente (`null`) vai SEMPRE para o fim, nos dois sentidos. */
export function ordenarLinhas<T extends LinhaDeCusto>(linhas: T[], ordem: Ordem | null): T[] {
  if (!ordem) return linhas;
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  return linhas
    .map((l, i) => ({ l, i, v: valorDaColuna(l, ordem.coluna) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return (a.v - b.v) * sinal || a.i - b.i;
    })
    .map((x) => x.l);
}

/** Clique no cabeçalho: 1º = sentido natural da coluna, 2º = inverte, 3º = volta à ordem original. */
export function alternarOrdem(atual: Ordem | null, coluna: ColunaOrdenavel): Ordem | null {
  const natural: Direcao = COMECA_DO_MENOR.has(coluna) ? "asc" : "desc";
  if (!atual || atual.coluna !== coluna) return { coluna, direcao: natural };
  if (atual.direcao === natural) return { coluna, direcao: natural === "asc" ? "desc" : "asc" };
  return null;
}

export const amostraPequena = (l: LinhaDeCusto): boolean =>
  l.conversas > 0 && l.conversas < AMOSTRA_MINIMA;
export const gastouSemLead = (l: LinhaDeCusto): boolean => (l.gasto ?? 0) > 0 && l.conversas === 0;

export interface TotalDaTabela {
  leads: number;
  qualificados: number;
  /** `null` sem régua de qualificação. */
  taxa: number | null;
  vendas: number;
  valorGanho: number;
  valorPipeline: number;
}

export function totalDaTabela(linhas: LinhaDeCusto[]): TotalDaTabela {
  const leads = linhas.reduce((s, l) => s + l.conversas, 0);
  const qualificados = linhas.reduce((s, l) => s + l.qualificados, 0);
  const semRegua = linhas.length > 0 && linhas.every((l) => l.taxa_qualificacao === null);
  return {
    leads,
    qualificados,
    taxa: semRegua || leads === 0 ? null : Math.round((qualificados / leads) * 1000) / 10,
    vendas: linhas.reduce((s, l) => s + l.vendas, 0),
    valorGanho: linhas.reduce((s, l) => s + l.valor_ganho, 0),
    valorPipeline: linhas.reduce((s, l) => s + l.valor_total, 0),
  };
}
