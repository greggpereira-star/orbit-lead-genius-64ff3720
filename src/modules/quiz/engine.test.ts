import { describe, it, expect } from 'vitest';
import {
  recomputeScore,
  maxPossibleScore,
  minPossibleScore,
  scorePercent,
  classifyTier,
  classifyTemperature,
  evaluateLogic,
  isBlockVisible,
  type LogicContext,
} from './engine';
import type { QuizBlock, QuizSchema, ScoreTier } from './types';

const escolha = (id: string, opts: Array<[string, number, string?]>): QuizBlock =>
  ({
    id,
    type: 'single-choice',
    options: opts.map(([oid, score, tag]) => ({ id: oid, label: oid, score, tag })),
  }) as QuizBlock;

const schemaDe = (blocks: QuizBlock[]): QuizSchema => ({ blocks }) as QuizSchema;

const TIERS: ScoreTier[] = [
  { id: 'a', label: 'Lead A', minPercent: 70 },
  { id: 'b', label: 'Lead B', minPercent: 40 },
  { id: 'c', label: 'Lead C', minPercent: 0 },
] as ScoreTier[];

describe('pontuação recalculada, não acumulada', () => {
  // Regressão: com o botão voltar, somar o delta a cada avanço contava a mesma
  // resposta duas vezes e deixava o visitante inflar o próprio resultado.
  const blocks = [escolha('q1', [['a', 10], ['b', 3]]), escolha('q2', [['a', 5], ['b', 1]])];

  it('soma só o que está valendo agora', () => {
    expect(recomputeScore(blocks, { q1: 'a', q2: 'a' }).score).toBe(15);
  });

  it('trocar a resposta substitui, não acumula', () => {
    const antes = recomputeScore(blocks, { q1: 'a', q2: 'a' }).score;
    const depois = recomputeScore(blocks, { q1: 'b', q2: 'a' }).score;
    expect(antes).toBe(15);
    expect(depois).toBe(8); // o acumulado daria 18
  });

  it('ignora bloco sem resposta', () => {
    expect(recomputeScore(blocks, { q1: 'a' }).score).toBe(10);
  });

  it('não repete etiqueta', () => {
    const comTag = [escolha('q1', [['a', 1, 'x']]), escolha('q2', [['a', 1, 'x']])];
    expect(recomputeScore(comTag, { q1: 'a', q2: 'a' }).tags).toEqual(['x']);
  });
});

describe('máximo alcançável respeita a exibição condicional', () => {
  // Regressão: contar pontos que o visitante não pode alcançar inflava o
  // denominador, e a faixa decide qual mensagem de WhatsApp é enviada.
  const schema = schemaDe([
    escolha('q1', [['a', 10], ['b', 0]]),
    { ...escolha('q2', [['a', 10], ['b', 0]]), showIf: { enabled: true, fieldBlockId: 'q1', op: 'eq', value: 'a' } } as QuizBlock,
  ]);

  it('sem respostas, soma o quiz inteiro', () => {
    expect(maxPossibleScore(schema)).toBe(20);
  });

  it('quem desviou não carrega o que não viu', () => {
    expect(maxPossibleScore(schema, { q1: 'b' })).toBe(10);
  });

  it('quem viu tudo mantém o teto cheio', () => {
    expect(maxPossibleScore(schema, { q1: 'a', q2: 'a' })).toBe(20);
  });
});

describe('percentual com pontuação negativa', () => {
  // Regressão: `score / max` saía negativo e não batia em faixa nenhuma — o
  // lead ficava sem classificação e sem mensagem, em silêncio.
  const schema = schemaDe([
    escolha('q1', [['certo', 10], ['errado', -10]]),
    escolha('q2', [['certo', 10], ['errado', -10]]),
  ]);
  const max = maxPossibleScore(schema);
  const min = minPossibleScore(schema);

  it('a faixa alcançável vai de -20 a 20', () => {
    expect([min, max]).toEqual([-20, 20]);
  });

  it('errar tudo é 0%, não -100%', () => {
    expect(scorePercent(-20, max, min)).toBe(0);
  });

  it('acertar metade é 50%, não 0%', () => {
    expect(scorePercent(0, max, min)).toBe(50);
  });

  it('e cai na faixa do meio, não no fundo', () => {
    expect(classifyTier(0, max, TIERS, min)?.label).toBe('Lead B');
  });

  it('quiz sem negativos não muda nada', () => {
    const limpo = schemaDe([escolha('q1', [['a', 10], ['b', 0]])]);
    const mx = maxPossibleScore(limpo);
    const mn = minPossibleScore(limpo);
    expect(mn).toBe(0);
    expect(scorePercent(10, mx, mn)).toBe((10 / mx) * 100);
    expect(classifyTemperature(10, mx, mn)).toBe('hot');
  });

  it('múltipla escolha pode não marcar nada: o piso é só o que é negativo', () => {
    const multi = schemaDe([
      { id: 'm', type: 'multi-choice', options: [
        { id: 'a', label: 'a', score: 5 },
        { id: 'b', label: 'b', score: -3 },
      ] } as QuizBlock,
    ]);
    expect(minPossibleScore(multi)).toBe(-3);
    expect(maxPossibleScore(multi)).toBe(5);
  });
});

describe('regras de salto', () => {
  const blocks = [
    escolha('q1', [['a', 10, 'ansiedade'], ['b', 0]]),
    escolha('q2', [['a', 10, 'ansiedade'], ['b', 0]]),
    escolha('q3', [['a', 10, 'ansiedade'], ['b', 0]]),
    escolha('q4', [['a', 10], ['b', 0]]),
  ];
  const ctx = (responses: Record<string, unknown>): LogicContext => ({
    responses,
    blocks,
    score: recomputeScore(blocks, responses).score,
    maxScore: maxPossibleScore(schemaDe(blocks)),
  });
  const comRegra = (r: Record<string, unknown>) =>
    ({ id: 'x', type: 'cta', logicRules: [{ ...r, jumpToBlockId: 'DESTINO' }] }) as unknown as QuizBlock;

  // 3 de 4 com a etiqueta = 75%
  const tresDeQuatro = { q1: 'a', q2: 'a', q3: 'a', q4: 'b' };

  it('por quantidade', () => {
    expect(evaluateLogic(comRegra({ kind: 'quantidade', tag: 'ansiedade', op: 'gte', value: 3 }), ctx(tresDeQuatro))).toBe('DESTINO');
    expect(evaluateLogic(comRegra({ kind: 'quantidade', tag: 'ansiedade', op: 'gte', value: 4 }), ctx(tresDeQuatro))).toBeUndefined();
  });

  it('por porcentagem', () => {
    expect(evaluateLogic(comRegra({ kind: 'porcentagem', tag: 'ansiedade', op: 'gte', value: 70 }), ctx(tresDeQuatro))).toBe('DESTINO');
    expect(evaluateLogic(comRegra({ kind: 'porcentagem', tag: 'ansiedade', op: 'gte', value: 80 }), ctx(tresDeQuatro))).toBeUndefined();
  });

  it('porcentagem NÃO dispara antes de haver resposta', () => {
    // Senão "menor que 30%" bateria logo na primeira etapa, com zero respostas.
    expect(evaluateLogic(comRegra({ kind: 'porcentagem', tag: 'ansiedade', op: 'lt', value: 30 }), ctx({}))).toBeUndefined();
  });

  it('por pontuação, com between', () => {
    expect(evaluateLogic(comRegra({ kind: 'pontuacao', op: 'between', value: 70, value2: 90 }), ctx(tresDeQuatro))).toBe('DESTINO');
    expect(evaluateLogic(comRegra({ kind: 'pontuacao', op: 'gt', value: 90 }), ctx(tresDeQuatro))).toBeUndefined();
  });

  it('gte/lte/between existem — antes só havia eq/neq/contains/gt/lt', () => {
    for (const op of ['gte', 'lte', 'between'] as const) {
      const regra = comRegra({ kind: 'pontuacao', op, value: 0, value2: 100 });
      expect(() => evaluateLogic(regra, ctx(tresDeQuatro))).not.toThrow();
    }
    expect(evaluateLogic(comRegra({ kind: 'pontuacao', op: 'gte', value: 75 }), ctx(tresDeQuatro))).toBe('DESTINO');
  });

  it('regra sem campo escolhido é ignorada, não estoura', () => {
    expect(evaluateLogic(comRegra({ kind: 'resposta', op: 'eq', value: 'a' }), ctx(tresDeQuatro))).toBeUndefined();
  });
});

describe('exibição condicional', () => {
  const bloco = (cond: unknown) => ({ id: 'b', type: 'cta', showIf: cond }) as unknown as QuizBlock;

  it('sem condição, sempre visível', () => {
    expect(isBlockVisible(bloco(undefined), {})).toBe(true);
    expect(isBlockVisible(bloco({ enabled: false, fieldBlockId: 'q1', op: 'eq', value: 'a' }), {})).toBe(true);
  });

  it('resposta ainda inexistente esconde o bloco', () => {
    expect(isBlockVisible(bloco({ enabled: true, fieldBlockId: 'q1', op: 'eq', value: 'a' }), {})).toBe(false);
  });

  it('`neq` é verdadeiro quando a resposta difere', () => {
    expect(isBlockVisible(bloco({ enabled: true, fieldBlockId: 'q1', op: 'neq', value: 'a' }), { q1: 'b' })).toBe(true);
  });

  it('between usa os dois limites, em qualquer ordem', () => {
    const b = bloco({ enabled: true, fieldBlockId: 'peso', op: 'between', value: 90, value2: 60 });
    expect(isBlockVisible(b, { peso: 70 })).toBe(true);
    expect(isBlockVisible(b, { peso: 50 })).toBe(false);
  });
});
