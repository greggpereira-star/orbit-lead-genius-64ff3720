import { describe, it, expect } from 'vitest';
import { designDaEtapa, varsDoBloco, temCorPropria, coresDoDocumento } from './temaDoBloco';
import type { QuizBlock, QuizDesign, QuizStep } from '../types';

const design = {
  primary: '#111', background: '#fff', surface: '#eee', text: '#000', muted: '#888',
  radius: 12, fontHeading: 'Inter', fontBody: 'Inter', presetId: 'x',
  buttonStyle: 'solid', progressStyle: 'bar',
} as QuizDesign;

describe('design por etapa', () => {
  it('sem sobrescrita, devolve o design do funil', () => {
    expect(designDaEtapa(design, { id: 's', blockIds: [] })).toBe(design);
  });

  it('só as chaves presentes mandam — o resto continua herdando', () => {
    const r = designDaEtapa(design, { id: 's', blockIds: [], design: { background: '#000' } } as QuizStep);
    expect(r.background).toBe('#000');
    expect(r.primary).toBe('#111');
    expect(r.fontBody).toBe('Inter');
  });

  it('string vazia não sobrescreve — é campo limpo, não cor preta', () => {
    const r = designDaEtapa(design, { id: 's', blockIds: [], design: { background: '' } } as QuizStep);
    expect(r.background).toBe('#fff');
  });
});

describe('cores do bloco', () => {
  it('bloco sem cor própria não gera variável nenhuma', () => {
    expect(temCorPropria({ id: 'b' } as QuizBlock)).toBe(false);
    expect(varsDoBloco({ id: 'b' } as QuizBlock)).toBeUndefined();
  });

  it('a cor do texto vale para texto E título', () => {
    const v = varsDoBloco({ id: 'b', corDoTexto: '#f00' } as QuizBlock) as Record<string, string>;
    expect(v['--quiz-text']).toBe('#f00');
    expect(v['--quiz-title']).toBe('#f00');
  });
});

describe('cores do documento', () => {
  it('reúne as do tema, dos blocos e das etapas, sem repetir', () => {
    const blocks = [{ id: 'b', corDeFundo: '#ABCDEF' }] as QuizBlock[];
    const steps = [{ id: 's', blockIds: [], design: { primary: '#abcdef' } }] as QuizStep[];
    const r = coresDoDocumento(design, blocks, steps);
    // `#ABCDEF` e `#abcdef` são a MESMA cor: listar as duas confundiria.
    expect(r.filter((c) => c.toLowerCase() === '#abcdef')).toHaveLength(1);
    expect(r).toContain('#111');
  });
});
