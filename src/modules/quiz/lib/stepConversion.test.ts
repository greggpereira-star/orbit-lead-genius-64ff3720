import { describe, it, expect } from 'vitest';
import { calcularConversaoPorEtapa, MINIMO_PARA_NOTA } from './stepConversion';
import type { QuizStep } from '../types';

const steps: QuizStep[] = [
  { id: 'e1', blockIds: ['a'] },
  { id: 'e2', blockIds: ['b'] },
  { id: 'e3', blockIds: ['c'] },
];
const ev = (session_id: string, block_id: string) => ({ session_id, block_id });

/** 10 sessões veem e1; 6 chegam a e2; 2 a e3. */
const base = [
  ...Array.from({ length: 10 }, (_, i) => ev(`s${i}`, 'a')),
  ...Array.from({ length: 6 }, (_, i) => ev(`s${i}`, 'b')),
  ...Array.from({ length: 2 }, (_, i) => ev(`s${i}`, 'c')),
];

describe('conversão por etapa', () => {
  it('conta VISITANTE, não visualização', () => {
    // Quem volta e avança de novo gerava duas visualizações e inflava o
    // denominador.
    const comRepetida = [...base, ev('s0', 'a'), ev('s0', 'a')];
    expect(calcularConversaoPorEtapa(steps, comRepetida)[0].visitantes).toBe(10);
  });

  it('"avançou" é ter chegado a qualquer etapa posterior', () => {
    const r = calcularConversaoPorEtapa(steps, base);
    expect(r[0]).toMatchObject({ visitantes: 10, avancaram: 6, taxa: 0.6, faixa: 'media' });
  });

  it('abaixo do mínimo não recebe nota', () => {
    // Com 3 visitantes, um desistente viraria "33%" e pintaria de vermelho uma
    // etapa sobre a qual nada foi medido.
    const poucos = [ev('s1', 'a'), ev('s2', 'a'), ev('s3', 'a'), ev('s1', 'b')];
    const r = calcularConversaoPorEtapa(steps, poucos);
    expect(r[0].visitantes).toBeLessThan(MINIMO_PARA_NOTA);
    expect(r[0].taxa).toBeNull();
    expect(r[0].faixa).toBe('sem-dados');
  });

  it('a última etapa nunca tem nota: não existe posterior para medir', () => {
    expect(calcularConversaoPorEtapa(steps, base).at(-1)?.taxa).toBeNull();
  });

  it('ignora evento sem sessão — é o que havia antes de 05/10/2026', () => {
    const semSessao = base.map((e) => ({ ...e, session_id: null }));
    expect(calcularConversaoPorEtapa(steps, semSessao)[0].visitantes).toBe(0);
  });

  it('ignora bloco que não pertence a etapa nenhuma', () => {
    const r = calcularConversaoPorEtapa(steps, [...base, ev('sX', 'bloco-removido')]);
    expect(r[0].visitantes).toBe(10);
  });

  it('as faixas seguem os limiares', () => {
    const comTaxa = (avancaram: number) => {
      const eventos = [
        ...Array.from({ length: 10 }, (_, i) => ev(`s${i}`, 'a')),
        ...Array.from({ length: avancaram }, (_, i) => ev(`s${i}`, 'b')),
      ];
      return calcularConversaoPorEtapa(steps, eventos)[0].faixa;
    };
    expect(comTaxa(3)).toBe('baixa');
    expect(comTaxa(5)).toBe('media');
    expect(comTaxa(8)).toBe('alta');
    expect(comTaxa(10)).toBe('super-alta');
  });
});
