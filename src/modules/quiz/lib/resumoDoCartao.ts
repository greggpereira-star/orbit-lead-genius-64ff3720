import type { QuizStep } from "../types";
import { contarVisitantes } from "./contagemDeVisitantes";
import { calcularConversaoPorEtapa, MINIMO_PARA_NOTA, type FaixaConversao } from "./stepConversion";

export interface EventoDoCartao {
  quiz_id: string;
  event_type: string;
  block_id: string | null;
  session_id: string | null;
  created_at: string;
}

export interface SubmissaoDoCartao {
  quiz_id: string;
  status: string | null;
  created_at: string;
  answers: Record<string, unknown> | null;
}

/** Uma célula do mapa de calor: uma etapa, na cor de quanta gente passou dela. */
export interface CelulaDoMapa {
  numero: number;
  nome: string;
  faixa: FaixaConversao;
  /** `null` quando a amostra é pequena demais para afirmar. */
  percentualQueAvancou: number | null;
  visitantes: number;
}

export interface ResumoDoCartao {
  /** Pessoas distintas que abriram o quiz nos últimos 30 dias. */
  visitantes: number;
  /** Os 30 dias anteriores a esses, para a variação. */
  visitantesAnteriores: number;
  leads: number;
  /** leads ÷ visitantes, em %. `null` sem visitante. */
  taxaDeLead: number | null;
  /** Variação de visitantes em %. `null` quando o período anterior é pequeno demais. */
  variacao: number | null;
  /** Amostra abaixo do mínimo: o cartão avisa em vez de dar nota. */
  amostraPequena: boolean;
  /** Mapa de calor por etapa; vazio quando não há schema ou amostra. */
  mapa: CelulaDoMapa[];
  /** A etapa que mais perde gente, com número que a sustenta. */
  maiorPerda: { numero: number; nome: string; percentualQueSai: number; visitantes: number } | null;
}

const DIA = 86_400_000;

/** Abaixo disto o período anterior não serve de régua: 1 → 3 visitas é "+200%". */
export const MINIMO_PARA_VARIACAO = 8;

/**
 * Tudo que o cartão da lista mostra, de um quiz só, vindo dos mesmos eventos
 * que a tela de Performance lê.
 *
 * Visitante é SESSÃO, não evento: o `start` dispara a cada carregamento, e quem
 * volta para terminar emitiria dois. É a mesma regra de `contarVisitantes`,
 * medida em 14/10 (35 eventos para 28 sessões). O cartão antigo contava
 * evento — num quiz desta base isso dava 29 visitas para 15 pessoas.
 *
 * `agora` entra por parâmetro: a janela de 30 dias é a única coisa não
 * determinística aqui, e assim o teste não depende do relógio.
 */
export function resumirParaCartao(params: {
  eventos: EventoDoCartao[];
  submissoes: SubmissaoDoCartao[];
  steps?: QuizStep[];
  agora: number;
}): ResumoDoCartao {
  const { eventos, submissoes, steps, agora } = params;
  const corte = agora - 30 * DIA;

  const atuais = eventos.filter((e) => new Date(e.created_at).getTime() >= corte);
  const anteriores = eventos.filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t < corte && t >= corte - 30 * DIA;
  });

  const visitantes = contarVisitantes(atuais, "start");
  const visitantesAnteriores = contarVisitantes(anteriores, "start");

  const leads = submissoes.filter((s) => {
    if (new Date(s.created_at).getTime() < corte) return false;
    const c = (s.answers?._contact ?? {}) as { email?: string | null; phone?: string | null };
    return !!(c.email || c.phone);
  }).length;

  /* Quiz de antes do `start` ser gravado: sem nenhum início, a pessoa que
     deixou contato é o próprio denominador mínimo. Mantém o que a lista já
     fazia, em vez de mostrar "—" para um funil que claramente teve gente. */
  const base = visitantes > 0 ? visitantes : leads;

  const variacao =
    visitantesAnteriores >= MINIMO_PARA_VARIACAO
      ? Math.round(((visitantes - visitantesAnteriores) / visitantesAnteriores) * 100)
      : null;

  let mapa: CelulaDoMapa[] = [];
  let maiorPerda: ResumoDoCartao["maiorPerda"] = null;

  if (steps && steps.length > 1 && visitantes >= MINIMO_PARA_NOTA) {
    const conversao = calcularConversaoPorEtapa(
      steps,
      atuais.filter((e) => e.event_type === "block_view"),
    );
    mapa = conversao.map((c, i) => ({
      numero: i + 1,
      nome: steps[i].name?.trim() || `Etapa ${i + 1}`,
      faixa: c.faixa,
      percentualQueAvancou: c.taxa === null ? null : Math.round(c.taxa * 100),
      visitantes: c.visitantes,
    }));

    /* Só etapa com nota confiável concorre, e só se perde de fato alguém:
       "a pior" entre etapas em que todos avançam é nomear um defeito que não existe. */
    const candidatas = mapa
      .filter((c) => c.percentualQueAvancou !== null && c.percentualQueAvancou < 100)
      .sort((a, b) => a.percentualQueAvancou! - b.percentualQueAvancou!);
    const pior = candidatas[0];
    if (pior) {
      maiorPerda = {
        numero: pior.numero,
        nome: pior.nome,
        percentualQueSai: 100 - pior.percentualQueAvancou!,
        visitantes: pior.visitantes,
      };
    }
  }

  return {
    visitantes: base,
    visitantesAnteriores,
    leads,
    taxaDeLead: base > 0 ? (leads / base) * 100 : null,
    variacao,
    amostraPequena: base < MINIMO_PARA_NOTA,
    mapa,
    maiorPerda,
  };
}
