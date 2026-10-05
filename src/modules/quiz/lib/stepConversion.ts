import type { QuizStep } from '../types';

export type FaixaConversao = 'sem-dados' | 'baixa' | 'media' | 'alta' | 'super-alta';

export interface ConversaoDaEtapa {
  stepId: string;
  /** Sessões distintas que viram esta etapa. */
  visitantes: number;
  /** Dessas, quantas chegaram a alguma etapa posterior. */
  avancaram: number;
  /** `null` quando não há visitante suficiente para afirmar qualquer coisa. */
  taxa: number | null;
  faixa: FaixaConversao;
}

/**
 * Abaixo disto a taxa é ruído: com 3 visitantes, um desistente vira "33% de
 * conversão" e pintaria a etapa de vermelho sem que isso signifique nada.
 * Preferimos dizer "sem dados" a dar uma nota que induz a mexer no que está bom.
 */
export const MINIMO_PARA_NOTA = 8;

export const CORES_DE_FAIXA: Record<FaixaConversao, { cor: string; rotulo: string }> = {
  'sem-dados': { cor: '#9ca3af', rotulo: 'Sem dados' },
  baixa: { cor: '#F24822', rotulo: 'Baixa conversão' },
  media: { cor: '#FFCD29', rotulo: 'Média conversão' },
  alta: { cor: '#14AE5C', rotulo: 'Alta conversão' },
  'super-alta': { cor: '#008043', rotulo: 'Super alta conversão' },
};

function faixaDe(taxa: number | null): FaixaConversao {
  if (taxa === null) return 'sem-dados';
  if (taxa >= 0.9) return 'super-alta';
  if (taxa >= 0.7) return 'alta';
  if (taxa >= 0.4) return 'media';
  return 'baixa';
}

export interface EventoDeEtapa {
  block_id: string | null;
  session_id: string | null;
}

/**
 * Conversão por etapa a partir das visualizações de bloco.
 *
 * Calculada por SESSÃO, e não por visualização: quem volta uma etapa e avança
 * de novo geraria duas visualizações e inflaria o denominador. "Avançou" é ter
 * aparecido em QUALQUER etapa posterior — o quiz tem saltos condicionais, então
 * a etapa seguinte na lista nem sempre é a seguinte no caminho da pessoa.
 *
 * A última etapa nunca tem posterior; para ela a conversão é indefinida por
 * construção, e sai como `sem-dados` em vez de 0%.
 */
export function calcularConversaoPorEtapa(
  steps: QuizStep[],
  eventos: EventoDeEtapa[],
): ConversaoDaEtapa[] {
  const etapaDoBloco = new Map<string, number>();
  steps.forEach((s, i) => s.blockIds.forEach((b) => etapaDoBloco.set(b, i)));

  // sessão → maior índice de etapa alcançado, e o conjunto de etapas vistas
  const vistas = new Map<string, Set<number>>();
  for (const e of eventos) {
    if (!e.block_id || !e.session_id) continue;
    const idx = etapaDoBloco.get(e.block_id);
    if (idx === undefined) continue;
    let set = vistas.get(e.session_id);
    if (!set) { set = new Set(); vistas.set(e.session_id, set); }
    set.add(idx);
  }

  const visitantesPorEtapa = steps.map(() => 0);
  const avancaramPorEtapa = steps.map(() => 0);

  for (const set of vistas.values()) {
    const maior = Math.max(...set);
    for (const idx of set) {
      visitantesPorEtapa[idx] += 1;
      if (maior > idx) avancaramPorEtapa[idx] += 1;
    }
  }

  return steps.map((s, i) => {
    const visitantes = visitantesPorEtapa[i];
    const avancaram = avancaramPorEtapa[i];
    const ehUltima = i === steps.length - 1;
    const taxa = ehUltima || visitantes < MINIMO_PARA_NOTA ? null : avancaram / visitantes;
    return { stepId: s.id, visitantes, avancaram, taxa, faixa: faixaDe(taxa) };
  });
}
