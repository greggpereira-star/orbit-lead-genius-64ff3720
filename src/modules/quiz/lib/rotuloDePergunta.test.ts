import { describe, expect, it } from 'vitest';
import type { QuizBlock, QuizStep } from '../types';
import { rotuloDePergunta } from './rotuloDePergunta';

const bloco = (id: string, type: string, extra: Partial<QuizBlock> = {}) =>
  ({ id, type, title: id, ...extra }) as unknown as QuizBlock;
const etapa = (id: string, ...blockIds: string[]): QuizStep => ({ id, blockIds });

const blocks = [
  bloco('capa', 'intro'),
  bloco('tecnica', 'single-choice'),
  bloco('dupla', 'single-choice', {
    showIf: { enabled: true, op: 'eq', value: 'ambas', fieldBlockId: 'tecnica' },
  } as Partial<QuizBlock>),
  bloco('individual', 'single-choice', {
    showIf: { enabled: true, op: 'neq', value: 'ambas', fieldBlockId: 'tecnica' },
  } as Partial<QuizBlock>),
  bloco('aviso', 'alert'),
  bloco('form', 'form'),
  bloco('fim', 'result'),
];
const steps = [
  etapa('s-capa', 'capa'),
  etapa('s-tecnica', 'tecnica'),
  etapa('s-dupla', 'dupla'),
  etapa('s-individual', 'individual'),
  etapa('s-aviso', 'aviso'),
  etapa('s-form', 'form'),
  etapa('s-fim', 'fim'),
];

describe('rotuloDePergunta', () => {
  it('a capa, o aviso e o resultado não são pergunta', () => {
    expect(rotuloDePergunta(steps, blocks, 0, {})).toBeNull();
    expect(rotuloDePergunta(steps, blocks, 4, {})).toBeNull();
    expect(rotuloDePergunta(steps, blocks, 6, {})).toBeNull();
  });

  it('conta só as perguntas do caminho: etapas exclusivas valem por uma', () => {
    const r = { tecnica: 'toxina' };
    expect(rotuloDePergunta(steps, blocks, 1, r)).toEqual({ atual: 1, total: 3 });
    expect(rotuloDePergunta(steps, blocks, 3, r)).toEqual({ atual: 2, total: 3 });
    expect(rotuloDePergunta(steps, blocks, 5, r)).toEqual({ atual: 3, total: 3 });
  });

  it('o outro ramo conta igual', () => {
    const r = { tecnica: 'ambas' };
    expect(rotuloDePergunta(steps, blocks, 2, r)).toEqual({ atual: 2, total: 3 });
  });
});
