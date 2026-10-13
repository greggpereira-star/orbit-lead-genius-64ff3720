import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { salvarProgresso, lerProgresso, limparProgresso } from './progressoSalvo';
import type { QuizBlock, QuizStep } from '../types';
import type { QuizRunState } from '../engine';

const QUIZ = 'quiz-1';
const blocks = [{ id: 'a' }, { id: 'b' }] as QuizBlock[];

/** Três etapas com id, que é como o funil real é. */
const etapas = (ids: string[] = ['s0', 's1', 's2']): QuizStep[] =>
  ids.map((id) => ({ id, blockIds: [] })) as QuizStep[];
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
    const lido = lerProgresso(QUIZ, blocks, etapas());
    expect(lido?.sessionId).toBe('sessao-123');
    expect(lido?.state.responses).toEqual({ a: 'x' });
    expect(lido?.state.currentStepIndex).toBe(1);
  });

  it('sem nada guardado, devolve null', () => {
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('limpar apaga', () => {
    salvarProgresso(QUIZ, 's', estado());
    limparProgresso(QUIZ);
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('descarta quando o quiz foi editado e o bloco respondido sumiu', () => {
    // Pontuação e saltos foram calculados sobre outro funil; retomar ali daria
    // um resultado que o quiz atual não produz.
    salvarProgresso(QUIZ, 's', estado({ responses: { removido: 'x' } }));
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('descarta quando a etapa não existe mais (o quiz encurtou)', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 9 }));
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('descarta depois de 24h', () => {
    salvarProgresso(QUIZ, 's', estado());
    const chave = 'lf.q.' + QUIZ;
    const d = JSON.parse(localStorage.getItem(chave)!);
    d.ts = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(chave, JSON.stringify(d));
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('não retoma quando não há nada de útil guardado', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 0, responses: {} }));
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  it('conteúdo corrompido não derruba o quiz', () => {
    localStorage.setItem('lf.q.' + QUIZ, '{isto não é json');
    expect(() => lerProgresso(QUIZ, blocks, etapas())).not.toThrow();
    expect(lerProgresso(QUIZ, blocks, etapas())).toBeNull();
  });

  /**
   * O defeito que estes travam: o guarda só pegava quiz que ENCURTOU. Reordenar
   * as etapas, ou inserir uma no meio, mantinha o índice dentro da faixa — e o
   * visitante voltava calado para outra etapa, porque nada no sistema sabe que
   * a posição 3 de ontem não é a posição 3 de hoje.
   */
  it('etapa reordenada: volta para a MESMA etapa, na posição nova', () => {
    // Parou na etapa 's1' (posição 1). O autor moveu 's1' para o fim.
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 1 }), 's1');
    const lido = lerProgresso(QUIZ, blocks, etapas(['s0', 's2', 's1']));
    expect(lido?.state.currentStepIndex).toBe(2);
  });

  it('etapa inserida antes: o índice acompanha', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 1 }), 's1');
    const lido = lerProgresso(QUIZ, blocks, etapas(['nova', 's0', 's1', 's2']));
    expect(lido?.state.currentStepIndex).toBe(2);
  });

  it('nada mudou: o índice fica como estava', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 1 }), 's1');
    expect(lerProgresso(QUIZ, blocks, etapas())?.state.currentStepIndex).toBe(1);
  });

  it('etapa apagada: recomeça, porque não há para onde voltar', () => {
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 1 }), 's1');
    expect(lerProgresso(QUIZ, blocks, etapas(['s0', 's2']))).toBeNull();
  });

  it('progresso gravado ANTES desta mudança não quebra', () => {
    /* Sem `stepId` não dá para fazer melhor que o comportamento antigo — e a
       validade de 24h faz esse caso sumir sozinho em um dia. O que não pode é
       derrubar quem está no meio do quiz agora. */
    salvarProgresso(QUIZ, 's', estado({ currentStepIndex: 1 }));
    const chave = 'lf.q.' + QUIZ;
    const d = JSON.parse(localStorage.getItem(chave)!);
    delete d.stepId;
    localStorage.setItem(chave, JSON.stringify(d));
    expect(lerProgresso(QUIZ, blocks, etapas())?.state.currentStepIndex).toBe(1);
  });

  it('o player realmente grava o id da etapa', () => {
    /* Sem isto o conserto inteiro fica desligado e NENHUM outro teste acusa:
       `lerProgresso` continua sabendo reencontrar a etapa, mas nunca recebe o
       id para reencontrar. Verifiquei — tirando o argumento do player, os 820
       testes seguiam verdes. */
    const player = readFileSync('src/modules/quiz/components/QuizPlayer.tsx', 'utf8');
    expect(player).toContain('salvarProgresso(quizId, sessionId.current, state, steps[state.currentStepIndex]?.id)');
  });

  it('cada quiz tem a sua chave', () => {
    salvarProgresso(QUIZ, 's1', estado());
    salvarProgresso('outro', 's2', estado());
    expect(lerProgresso(QUIZ, blocks, etapas())?.sessionId).toBe('s1');
    expect(lerProgresso('outro', blocks, etapas())?.sessionId).toBe('s2');
  });
});
