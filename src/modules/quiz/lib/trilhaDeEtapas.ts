import type { ConversaoDaEtapa } from "./stepConversion";
import { CORES_DE_FAIXA, MINIMO_PARA_NOTA } from "./stepConversion";

/**
 * O que a etapa É, lido do que ela contém.
 *
 * Num funil de 24 telas, "Etapa 17" não diz nada. A primeira versão disto
 * separava só captura e resultado e chamava todo o resto de "percurso" — e a
 * trilha então imprimia a contagem de componentes na segunda linha. Medido no
 * funil do cliente em 07/10: **14 das 24 etapas diziam exatamente "1 comp."**.
 * Metade da altura do cartão, em 58% das etapas, não distinguia nada.
 *
 * A pergunta que o cartão tem de responder não é "quantas peças tem", é "que
 * tela é esta". Por isso a taxonomia desce ao que a pessoa reconhece: uma
 * pergunta, um vídeo, uma prova social, a captura, o resultado.
 */
export type NaturezaDaEtapa =
  "vazia" | "captura" | "resultado" | "pergunta" | "midia" | "prova" | "conteudo";

/**
 * A FUNÇÃO da tela ganha da composição dela.
 *
 * A ordem é deliberada: uma etapa com e-mail e oferta é, para quem monta, a
 * tela de resultado — é lá que a venda acontece, e a captura ali é detalhe de
 * arranjo. Mais abaixo, pergunta ganha de mídia porque uma pergunta com vídeo
 * de apoio continua sendo uma pergunta: é ela que decide o caminho do funil.
 */
export function naturezaDaEtapa(categorias: readonly string[]): NaturezaDaEtapa {
  if (categorias.length === 0) return "vazia";
  const tem = (...alvos: string[]) => categorias.some((c) => alvos.includes(c));
  if (tem("resultado", "oferta")) return "resultado";
  if (tem("captura")) return "captura";
  if (tem("interacao", "gamificacao")) return "pergunta";
  if (tem("midia")) return "midia";
  if (tem("prova")) return "prova";
  return "conteudo";
}

export const ROTULO_DA_NATUREZA: Record<NaturezaDaEtapa, string> = {
  vazia: "Vazia",
  captura: "Captura",
  resultado: "Resultado",
  pergunta: "Pergunta",
  midia: "Mídia",
  prova: "Prova",
  conteudo: "Conteúdo",
};

/**
 * Tinta de cada natureza.
 *
 * Captura e resultado puxam o olho porque são os dois pontos que decidem a
 * receita; o percurso usa tons frios e discretos. Vazia é âmbar porque é a
 * única que pede conserto.
 */
export const TINTA_DA_NATUREZA: Record<NaturezaDaEtapa, string> = {
  vazia: "#F59E0B",
  captura: "#38BDF8",
  resultado: "#34D399",
  pergunta: "#A78BFA",
  midia: "#F472B6",
  prova: "#FBBF24",
  conteudo: "#94A3B8",
};

export interface ResumoDaEtapa {
  id: string;
  /** 1-based, como aparece na tela. */
  numero: number;
  /** Nome dado pelo usuário, ou `Etapa N` quando ele não nomeou. */
  nome: string;
  natureza: NaturezaDaEtapa;
  /** "Pergunta", "Captura"… — o que a etapa É, para a segunda linha do cartão. */
  rotuloDaNatureza: string;
  /** Tinta da natureza, para a marca lateral e o chip do ícone. */
  tinta: string;
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
    rotuloDaNatureza: ROTULO_DA_NATUREZA[natureza],
    tinta: TINTA_DA_NATUREZA[natureza],
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
