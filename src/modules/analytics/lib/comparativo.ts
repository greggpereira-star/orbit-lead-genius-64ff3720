import { AMOSTRA_MINIMA } from "./anuncios";

/**
 * Comparativo com o período anterior (mesma duração, terminando onde o atual começa).
 *
 * Duas armadilhas guiam o desenho:
 *  1. Janela anterior INCOMPLETA: com 90 dias selecionados e leads só desde 21/07, o
 *     "anterior" cobre ~9 dias e compara 507 leads com 136. Nesse caso NÃO se compara.
 *  2. Coorte: os números contam leads CRIADOS na janela, vistos na etapa de hoje. O lead
 *     do período anterior teve mais tempo para avançar; por isso qualificados e vendas
 *     tendem a favorecê-lo, e a tela diz isso.
 */
export interface JanelaBruta {
  periodo: "atual" | "anterior";
  leads: number;
  qualificados: number | null;
  vendas: number;
  valor_ganho: number;
  identificados: number;
  primeiro_lead: string | null;
}

export interface Janela {
  leads: number;
  /** `null` quando nenhuma etapa foi marcada como conversão. */
  qualificados: number | null;
  /** Fração 0–1; `null` sem leads ou sem régua. */
  taxa: number | null;
  vendas: number;
  valorGanho: number;
  /** Fração 0–1 dos leads com canal conhecido; `null` sem leads. */
  origemIdentificada: number | null;
}

export type Comparativo =
  | { disponivel: false; motivo: "incompleto"; dadosDesde: Date }
  | { disponivel: false; motivo: "sem_dados" }
  | { disponivel: true; atual: Janela; anterior: Janela; baseAnteriorPequena: boolean };

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

function janela(b: JanelaBruta): Janela {
  const leads = num(b.leads);
  const qualificados =
    b.qualificados === null || b.qualificados === undefined ? null : num(b.qualificados);
  return {
    leads,
    qualificados,
    taxa: leads > 0 && qualificados !== null ? qualificados / leads : null,
    vendas: num(b.vendas),
    valorGanho: num(b.valor_ganho),
    origemIdentificada: leads > 0 ? num(b.identificados) / leads : null,
  };
}

/**
 * @param inicioDoAtual início do período atual (o mesmo `desde` enviado ao banco)
 * @param dias duração de cada janela
 */
export function analisarComparativo(
  linhas: JanelaBruta[],
  inicioDoAtual: Date,
  dias: number,
): Comparativo {
  const a = linhas.find((l) => l.periodo === "atual");
  const p = linhas.find((l) => l.periodo === "anterior");
  if (!a || !p) return { disponivel: false, motivo: "sem_dados" };

  const primeiro = a.primeiro_lead ?? p.primeiro_lead;
  if (!primeiro) return { disponivel: false, motivo: "sem_dados" };
  const dadosDesde = new Date(primeiro);
  const inicioDoAnterior = new Date(inicioDoAtual.getTime() - dias * 86400000);
  if (dadosDesde.getTime() > inicioDoAnterior.getTime()) {
    return { disponivel: false, motivo: "incompleto", dadosDesde };
  }

  const anterior = janela(p);
  return {
    disponivel: true,
    atual: janela(a),
    anterior,
    baseAnteriorPequena: anterior.leads < AMOSTRA_MINIMA,
  };
}

/** "+5,3%" / "−12%" / "sem variação"; `null` quando o anterior é zero (não existe base). */
export function variacaoPercentual(atual: number, anterior: number): string | null {
  if (anterior === 0) return null;
  const v = ((atual - anterior) / anterior) * 100;
  const arred = Math.round(v * 10) / 10;
  if (arred === 0) return "sem variação";
  const txt = Math.abs(arred).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${arred > 0 ? "+" : "−"}${txt}%`;
}

/** Diferença entre duas taxas, em pontos percentuais: "+2,1 p.p.". */
export function variacaoEmPontos(atual: number | null, anterior: number | null): string | null {
  if (atual === null || anterior === null) return null;
  const v = Math.round((atual - anterior) * 1000) / 10;
  if (v === 0) return "sem variação";
  const txt = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : "−"}${txt} p.p.`;
}
