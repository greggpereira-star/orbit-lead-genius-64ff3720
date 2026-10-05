import type { QuizStep } from '../types';

export interface EventoBruto {
  event_type: string;
  block_id: string | null;
  session_id: string | null;
  created_at: string;
}

export interface SubmissaoBruta {
  created_at: string;
  status: string | null;
  tracking: Record<string, unknown> | null;
}

export interface MetricasAvancadas {
  /** Fatia que viu só UMA etapa e foi embora. */
  taxaDeRejeicao: number | null;
  /** Segundos entre a primeira e a última interação de cada sessão, mediana. */
  tempoMedioSegundos: number | null;
  /** Quantas etapas a pessoa conclui, em média. */
  mediaDeEtapas: number | null;
  /** Até que ponto do funil se chega, em proporção do total. */
  profundidadeMedia: number | null;
  /** Hora do dia com mais conclusões. */
  melhorHorario: { hora: number; conclusoes: number } | null;
  /** Origem com melhor taxa de conclusão (entre as que têm volume). */
  melhorOrigem: { origem: string; conclusoes: number; taxa: number } | null;
  /** Quantas sessões sustentam os números acima. */
  sessoes: number;
}

const vazio: MetricasAvancadas = {
  taxaDeRejeicao: null, tempoMedioSegundos: null, mediaDeEtapas: null,
  profundidadeMedia: null, melhorHorario: null, melhorOrigem: null, sessoes: 0,
};

/** Mediana, não média: uma aba esquecida aberta por três horas destrói a média. */
function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Abaixo disto qualquer recorte é anedota, não métrica. */
export const MINIMO_DE_SESSOES = 8;
/** Uma origem precisa de volume próprio para ser comparada com as outras. */
export const MINIMO_POR_ORIGEM = 5;

/**
 * As métricas que o painel do inlead mostra e o nosso não tinha.
 *
 * Todas saem das sessões, não das visualizações: sem isso, quem volta uma
 * etapa aparece como duas pessoas. Eventos sem `session_id` são ignorados —
 * são os anteriores a 05/10/2026, quando a coluna passou a ser gravada.
 */
export function calcularMetricasAvancadas(
  steps: QuizStep[],
  eventos: EventoBruto[],
  submissoes: SubmissaoBruta[],
): MetricasAvancadas {
  const etapaDoBloco = new Map<string, number>();
  steps.forEach((s, i) => s.blockIds.forEach((b) => etapaDoBloco.set(b, i)));

  const porSessao = new Map<string, { etapas: Set<number>; inicio: number; fim: number }>();
  for (const e of eventos) {
    if (!e.session_id) continue;
    const t = new Date(e.created_at).getTime();
    let s = porSessao.get(e.session_id);
    if (!s) { s = { etapas: new Set(), inicio: t, fim: t }; porSessao.set(e.session_id, s); }
    s.inicio = Math.min(s.inicio, t);
    s.fim = Math.max(s.fim, t);
    const idx = e.block_id ? etapaDoBloco.get(e.block_id) : undefined;
    if (idx !== undefined) s.etapas.add(idx);
  }

  const sessoes = [...porSessao.values()].filter((s) => s.etapas.size > 0);
  if (sessoes.length < MINIMO_DE_SESSOES) return { ...vazio, sessoes: sessoes.length };

  const umaEtapaSo = sessoes.filter((s) => s.etapas.size === 1).length;

  /* O tempo só é mensurável em quem passou por mais de UMA etapa: numa sessão
     de etapa única o início e o fim são o mesmo instante, e incluí-la puxava a
     mediana para zero — a tela mostrava "Tempo médio: 0 s", que não quer dizer
     nada. O teto de 1h descarta a aba esquecida aberta. */
  const duracoes = sessoes
    .filter((s) => s.etapas.size > 1)
    .map((s) => (s.fim - s.inicio) / 1000)
    .filter((d) => d >= 1 && d < 3600);
  const alcance = sessoes.map((s) => Math.max(...s.etapas) + 1);

  // ---- Melhor horário: hora local da conclusão ----
  const concluidas = submissoes.filter((s) => s.status === 'completed');
  const porHora = new Map<number, number>();
  for (const s of concluidas) {
    const h = new Date(s.created_at).getHours();
    porHora.set(h, (porHora.get(h) ?? 0) + 1);
  }
  const melhorHorario = [...porHora.entries()]
    .map(([hora, conclusoes]) => ({ hora, conclusoes }))
    .sort((a, b) => b.conclusoes - a.conclusoes)[0] ?? null;

  // ---- Melhor origem: por TAXA, não por volume ----
  // A origem que mais traz gente não é necessariamente a que melhor converte,
  // e é a segunda que diz onde investir.
  const porOrigem = new Map<string, { total: number; concluiu: number }>();
  for (const s of submissoes) {
    const origem = (s.tracking?.utm_source as string | undefined)?.trim() || '(direto)';
    const o = porOrigem.get(origem) ?? { total: 0, concluiu: 0 };
    o.total += 1;
    if (s.status === 'completed') o.concluiu += 1;
    porOrigem.set(origem, o);
  }
  const melhorOrigem = [...porOrigem.entries()]
    .filter(([, o]) => o.total >= MINIMO_POR_ORIGEM)
    .map(([origem, o]) => ({ origem, conclusoes: o.concluiu, taxa: o.concluiu / o.total }))
    .sort((a, b) => b.taxa - a.taxa)[0] ?? null;

  return {
    taxaDeRejeicao: umaEtapaSo / sessoes.length,
    tempoMedioSegundos: mediana(duracoes),
    mediaDeEtapas: mediana(alcance),
    profundidadeMedia: steps.length > 0 ? (mediana(alcance) ?? 0) / steps.length : null,
    melhorHorario,
    melhorOrigem,
    sessoes: sessoes.length,
  };
}
