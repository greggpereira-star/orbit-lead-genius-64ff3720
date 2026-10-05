import { describe, it, expect, beforeEach } from 'vitest';
import { salvarProgresso, lerProgresso, limparProgresso } from './progressoSalvo';
import type { QuizBlock } from '../types';
import type { QuizRunState } from '../engine';

const QUIZ = 'quiz-1';
const blocks = [{ id: 'a' }, { id: 'b' }] as QuizBlock[];
const estado = (over: Partial<QuizRunState> = {}): QuizRunState => ({
  currentStepIndex: 1,
  responses: { a: 'x' },
  score: 10,
  tags: [],
  history: [],
  ...over,
});

beforeEach(() => localStorage.clear());

describe('progresso salvo', () => {
  it('vai e volta com a mesma sessão', () => {
    // A sessão é guardada junto de propósito: sem ela, quem voltasse viraria um
    // lead NOVO e a captura antecipada do primeiro acesso ficaria órfã.
    salvarProgresso(QUIZ, 'sessao-123', estado());
    const lido = lerProgresso(QUIZ, blocks, 3);
    expect(lido?.sessionId).toBe('sessao-123');
    expect(lido?.state.responses).toEqual({ a: 'x' });
    expect(lido?.state.currentStepIndex).toBe(1);
  });

  it('sem nada guardado, devolve null', () => {
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('limpar apaga', () => {
    salvarProgresso(QUIZ, 's', estado());
    limparProgresso(QUIZ);
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('descarta quando o quiz foi editado e o bloco respondido sumiu', () => {
    // Pontuação e saltos foram calculados sobre outro funil; retomar ali daria
    // um resultado que o quiz atual não produz.
    salvarProgresso(QUIZ, 's', estado({ responses: { removido: 'x' } }));
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('descarta quando a etapa não existe mais (o quiz encurtou)', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 9 }));
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('descarta depois de 24h', () => {
    salvarProgresso(QUIZ, 's', estado());
    const chave = 'lf.q.' + QUIZ;
    const d = JSON.parse(localStorage.getItem(chave)!);
    d.ts = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(chave, JSON.stringify(d));
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('não retoma quando não há nada de útil guardado', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 0, responses: {} }));
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('conteúdo corrompido não derruba o quiz', () => {
    localStorage.setItem('lf.q.' + QUIZ, '{isto não é json');
    expect(() => lerProgresso(QUIZ, blocks, 3)).not.toThrow();
    expect(lerProgresso(QUIZ, blocks, 3)).toBeNull();
  });

  it('cada quiz tem a sua chave', () => {
    salvarProgresso(QUIZ, 's1', estado());
    salvarProgresso('outro', 's2', estado());
    expect(lerProgresso(QUIZ, blocks, 3)?.sessionId).toBe('s1');
    expect(lerProgresso('outro', blocks, 3)?.sessionId).toBe('s2');
  });
});
