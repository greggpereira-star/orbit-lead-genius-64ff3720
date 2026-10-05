import { describe, it, expect } from 'vitest';
import { calcularMetricasAvancadas, MINIMO_DE_SESSOES, type EventoBruto, type SubmissaoBruta } from './metricasAvancadas';
import type { QuizStep } from '../types';

const steps: QuizStep[] = [
  { id: 'e1', blockIds: ['a'] }, { id: 'e2', blockIds: ['b'] },
  { id: 'e3', blockIds: ['c'] }, { id: 'e4', blockIds: ['d'] },
];
const t = (min: number) => new Date(Date.UTC(2026, 9, 5, 12, min)).toISOString();
const ev = (session_id: string, block_id: string, min: number): EventoBruto =>
  ({ event_type: 'block_view', block_id, session_id, created_at: t(min) });

/** 10 sessões: 3 param na primeira etapa, 7 chegam à terceira. */
const eventos: EventoBruto[] = [
  ...Array.from({ length: 10 }, (_, i) => ev(`s${i}`, 'a', 0)),
  ...Array.from({ length: 7 }, (_, i) => ev(`s${i}`, 'b', 1)),
  ...Array.from({ length: 7 }, (_, i) => ev(`s${i}`, 'c', 2)),
];

describe('métricas avançadas', () => {
  it('abaixo do mínimo de sessões, não afirma nada', () => {
    const poucas = eventos.filter((e) => Number(e.session_id!.slice(1)) < 3);
    const r = calcularMetricasAvancadas(steps, poucas, []);
    expect(r.sessoes).toBeLessThan(MINIMO_DE_SESSOES);
    expect(r.taxaDeRejeicao).toBeNull();
    expect(r.tempoMedioSegundos).toBeNull();
  });

  it('rejeição é quem viu UMA etapa só', () => {
    expect(calcularMetricasAvancadas(steps, eventos, []).taxaDeRejeicao).toBeCloseTo(0.3);
  });

  it('profundidade é o alcance sobre o total de etapas', () => {
    const r = calcularMetricasAvancadas(steps, eventos, []);
    expect(r.mediaDeEtapas).toBe(3);
    expect(r.profundidadeMedia).toBeCloseTo(3 / 4);
  });

  it('ignora evento sem sessão', () => {
    const semSessao = eventos.map((e) => ({ ...e, session_id: null }));
    expect(calcularMetricasAvancadas(steps, semSessao, []).sessoes).toBe(0);
  });

  it('sessão de etapa única NÃO entra no tempo — início e fim são o mesmo instante', () => {
    // Incluí-las puxava a mediana para zero e a tela mostrava "0 s".
    const soUmaEtapa: EventoBruto[] = Array.from({ length: 10 }, (_, i) => ev(`u${i}`, 'a', 0));
    expect(calcularMetricasAvancadas(steps, soUmaEtapa, []).tempoMedioSegundos).toBeNull();
  });

  it('o tempo usa MEDIANA — uma aba esquecida não destrói o número', () => {
    const comDiscrepante = [...eventos, ev('s0', 'd', 59)];
    const r = calcularMetricasAvancadas(steps, comDiscrepante, []);
    // A sessão s0 passa a durar 59 min; a mediana continua perto dos 2 min.
    expect(r.tempoMedioSegundos!).toBeLessThan(600);
  });

  it('melhor origem é por TAXA, não por volume', () => {
    // 'muito' traz 10 e converte 1; 'pouco' traz 5 e converte 4.
    const subs: SubmissaoBruta[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ created_at: t(i), status: i === 0 ? 'completed' : 'abandoned', tracking: { utm_source: 'muito' } })),
      ...Array.from({ length: 5 }, (_, i) => ({ created_at: t(i), status: i < 4 ? 'completed' : 'abandoned', tracking: { utm_source: 'pouco' } })),
    ];
    expect(calcularMetricasAvancadas(steps, eventos, subs).melhorOrigem?.origem).toBe('pouco');
  });

  it('origem sem volume próprio não entra na disputa', () => {
    const subs: SubmissaoBruta[] = [
      { created_at: t(0), status: 'completed', tracking: { utm_source: 'sorte' } },
      ...Array.from({ length: 6 }, (_, i) => ({ created_at: t(i), status: i < 3 ? 'completed' : 'abandoned', tracking: { utm_source: 'real' } })),
    ];
    // 'sorte' tem 100% de conclusão com UMA submissão — não é métrica, é acaso.
    expect(calcularMetricasAvancadas(steps, eventos, subs).melhorOrigem?.origem).toBe('real');
  });

  it('melhor horário é a hora com mais conclusões', () => {
    const subs: SubmissaoBruta[] = [
      { created_at: new Date(2026, 9, 5, 9, 0).toISOString(), status: 'completed', tracking: null },
      { created_at: new Date(2026, 9, 5, 20, 0).toISOString(), status: 'completed', tracking: null },
      { created_at: new Date(2026, 9, 5, 20, 30).toISOString(), status: 'completed', tracking: null },
    ];
    expect(calcularMetricasAvancadas(steps, eventos, subs).melhorHorario).toEqual({ hora: 20, conclusoes: 2 });
  });
});
