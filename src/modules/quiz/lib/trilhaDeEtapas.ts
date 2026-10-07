import type { ConversaoDaEtapa } from "./stepConversion";
import { CORES_DE_FAIXA, MINIMO_PARA_NOTA } from "./stepConversion";

/**
 * O que a etapa É, lido do que ela contém.
 *
 * Num funil de 24 telas, "Etapa 17" não diz nada. O que o construtor precisa
 * enxergar de relance é ONDE está a captura e ONDE está o resultado — são os
 * dois pontos que decidem a receita do quiz. O resto é percurso.
 */
export type NaturezaDaEtapa = "vazia" | "captura" | "resultado" | "percurso";

/**
 * Resultado ganha de captura ganha de percurso.
 *
 * Uma etapa que tem e-mail E oferta é, para quem está montando, a tela de
 * resultado: é lá que a venda acontece. A captura dentro dela é detalhe de
 * composição, não a função da tela.
 */
export function naturezaDaEtapa(categorias: readonly string[]): NaturezaDaEtapa {
  if (categorias.length === 0) return "vazia";
  if (categorias.some((c) => c === "resultado" || c === "oferta")) return "resultado";
  if (categorias.some((c) => c === "captura")) return "captura";
  return "percurso";
}

export const ROTULO_DA_NATUREZA: Record<NaturezaDaEtapa, string> = {
  vazia: "Vazia",
  captura: "Captura",
  resultado: "Resultado",
  percurso: "Percurso",
};

export interface ResumoDaEtapa {
  id: string;
  /** 1-based, como aparece na tela. */
  numero: number;
  /** Nome dado pelo usuário, ou `Etapa N` quando ele não nomeou. */
  nome: string;
  natureza: NaturezaDaEtapa;
  componentes: number;
  /** `63` para 63%. `null` quando não há visitante suficiente para afirmar. */
  percentual: number | null;
  /** Cor da faixa de conversão, para a marca no cartão. */
  cor: string | null;
  /** Texto do `title`: tudo que não cabe no cartão. */
  titulo: string;
}

/**
 * Monta o cartão de uma etapa na trilha.
 *
 * A taxa só vira número quando é confiável. Abaixo do mínimo o cartão fica sem
 * marca nenhuma, e não com um "0%" que faria o usuário mexer numa etapa que
 * talvez esteja ótima — é a mesma regra do selo da lista lateral, e ela não
 * pode divergir entre as duas telas.
 */
export function resumirEtapa(params: {
  id: string;
  indice: number;
  nome?: string | null;
  categorias: readonly string[];
  conversao?: ConversaoDaEtapa;
}): ResumoDaEtapa {
  const { id, indice, nome, categorias, conversao } = params;
  const numero = indice + 1;
  const natureza = naturezaDaEtapa(categorias);
  const confiavel =
    conversao && conversao.taxa !== null && conversao.visitantes >= MINIMO_PARA_NOTA;
  const percentual = confiavel ? Math.round(conversao.taxa! * 100) : null;

  const partes = [`Etapa ${numero}`];
  if (nome) partes.push(nome);
  partes.push(
    categorias.length === 0
      ? "vazia — escolha um bloco"
      : `${categorias.length} componente${categorias.length > 1 ? "s" : ""}`,
  );
  if (percentual !== null && conversao) {
    partes.push(
      `${percentual}% avançaram (${conversao.avancaram} de ${conversao.visitantes} em 30 dias)`,
    );
  } else if (conversao && conversao.visitantes > 0) {
    partes.push(`${conversao.visitantes} visitante(s) — poucos para uma taxa confiável`);
  }

  return {
    id,
    numero,
    nome: nome || `Etapa ${numero}`,
    natureza,
    componentes: categorias.length,
    percentual,
    cor: confiavel ? CORES_DE_FAIXA[conversao.faixa].cor : null,
    titulo: partes.join(" · "),
  };
}

/**
 * Quanto rolar para a etapa `alvo` ficar centrada na trilha.
 *
 * Centrar em vez de só "trazer para dentro" porque, numa trilha de 24 cartões,
 * a etapa corrente encostada na borda não mostra nem o que vem antes nem o que
 * vem depois — e é justamente a vizinhança que o usuário usa para se situar.
 */
export function rolagemParaCentralizar(params: {
  inicioDoAlvo: number;
  larguraDoAlvo: number;
  larguraVisivel: number;
  larguraTotal: number;
}): number {
  const { inicioDoAlvo, larguraDoAlvo, larguraVisivel, larguraTotal } = params;
  const ideal = inicioDoAlvo + larguraDoAlvo / 2 - larguraVisivel / 2;
  const maximo = Math.max(0, larguraTotal - larguraVisivel);
  return Math.min(Math.max(0, ideal), maximo);
}
