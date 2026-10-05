import type { BlockLogicOp, BlockOption, QuizBlock, QuizSchema, QuizStep } from './types';
import { findStepIndexForBlock } from './lib/steps';
import { evaluateExpression, resolveScope, type VariableScope } from './lib/variables';

export type QuizResponses = Record<string, unknown>;

export interface QuizRunState {
  currentStepIndex: number;
  responses: QuizResponses;
  score: number;
  tags: string[];
  history: string[]; // block ids visited
}

export function createInitialState(): QuizRunState {
  return { currentStepIndex: 0, responses: {}, score: 0, tags: [], history: [] };
}

function optionsFor(block: QuizBlock): BlockOption[] {
  return block.options ?? [];
}

/**
 * Given a block and the user's response, compute score delta and tag(s) picked up.
 */
export function evaluateResponse(
  block: QuizBlock,
  response: unknown
): { scoreDelta: number; tags: string[]; jumpToBlockId?: string } {
  const weight = block.scoreWeight ?? 1;
  let scoreDelta = 0;
  const tags: string[] = [];
  let jumpToBlockId: string | undefined;

  if (block.type === 'single-choice' && typeof response === 'string') {
    const opt = optionsFor(block).find((o) => o.id === response);
    if (opt) {
      scoreDelta += (opt.score ?? 0) * weight;
      if (opt.tag) tags.push(opt.tag);
      if (opt.jumpToBlockId) jumpToBlockId = opt.jumpToBlockId;
    }
  } else if (block.type === 'multi-choice' && Array.isArray(response)) {
    for (const id of response as string[]) {
      const opt = optionsFor(block).find((o) => o.id === id);
      if (opt) {
        scoreDelta += (opt.score ?? 0) * weight;
        if (opt.tag) tags.push(opt.tag);
      }
    }
  } else if (block.type === 'rating' && typeof response === 'number') {
    scoreDelta += response * weight;
  }

  return { scoreDelta, tags, jumpToBlockId };
}

/**
 * Evaluate logic rules attached to `block` against accumulated responses.
 * Returns the first matching jumpToBlockId, else undefined.
 */
export interface LogicContext {
  responses: QuizResponses;
  /** Todos os blocos do quiz — necessário para contar etiquetas já ganhas. */
  blocks: QuizBlock[];
  score: number;
  maxScore: number;
}

/** Compara dois valores pelo operador, com a semântica de `isBlockVisible`. */
function compara(bruto: unknown, op: BlockLogicOp, alvo: string | number, alvo2?: number): boolean {
  const comoNumero = (v: unknown): number => (Array.isArray(v) ? Number.NaN : Number(v));
  const igual = Array.isArray(bruto)
    ? (bruto as unknown[]).map(String).includes(String(alvo))
    : String(bruto ?? '') === String(alvo);
  switch (op) {
    case 'eq': return igual;
    case 'neq': return !igual;
    case 'contains':
      return Array.isArray(bruto)
        ? (bruto as unknown[]).map(String).includes(String(alvo))
        : String(bruto ?? '').toLowerCase().includes(String(alvo).toLowerCase());
    case 'gt': return comoNumero(bruto) > Number(alvo);
    case 'gte': return comoNumero(bruto) >= Number(alvo);
    case 'lt': return comoNumero(bruto) < Number(alvo);
    case 'lte': return comoNumero(bruto) <= Number(alvo);
    case 'between': {
      const n = comoNumero(bruto);
      const lo = Number(alvo);
      const hi = Number(alvo2 ?? alvo);
      return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
    }
    default: return false;
  }
}

/**
 * Quantas vezes a etiqueta foi ganha, e sobre quantas perguntas respondidas.
 *
 * O denominador são as perguntas RESPONDIDAS, não todas as do quiz: com salto
 * condicional ninguém vê o funil inteiro, e dividir pelo total faria a regra
 * por porcentagem nunca bater para quem pulou etapas.
 */
function contarEtiqueta(ctx: LogicContext, tag: string): { vezes: number; de: number } {
  let vezes = 0;
  let de = 0;
  for (const b of ctx.blocks) {
    if (!(b.id in ctx.responses)) continue;
    const r = evaluateResponse(b, ctx.responses[b.id]);
    // Só conta como "pergunta respondida" o que pode carregar etiqueta; um
    // campo de texto no meio do caminho não deve diluir a porcentagem.
    if (b.type === 'single-choice' || b.type === 'multi-choice' || b.type === 'rating') de += 1;
    vezes += r.tags.filter((t) => t === tag).length;
  }
  return { vezes, de };
}

/**
 * Primeira regra de salto que bate, ou `undefined`.
 *
 * Aceita o contexto inteiro (e não só as respostas) porque as regras por
 * quantidade, porcentagem e pontuação não olham uma resposta isolada — elas
 * olham o acumulado da pessoa até aqui.
 */
export function evaluateLogic(block: QuizBlock, ctx: LogicContext): string | undefined {
  for (const rule of block.logicRules ?? []) {
    const kind = rule.kind ?? 'resposta';
    let bruto: unknown;

    if (kind === 'resposta') {
      if (!rule.fieldBlockId) continue;
      bruto = ctx.responses[rule.fieldBlockId];
    } else if (kind === 'pontuacao') {
      if (ctx.maxScore <= 0) continue;
      bruto = (ctx.score / ctx.maxScore) * 100;
    } else {
      if (!rule.tag) continue;
      const { vezes, de } = contarEtiqueta(ctx, rule.tag);
      if (kind === 'quantidade') {
        bruto = vezes;
      } else {
        // Sem pergunta pontuável respondida ainda, a porcentagem não existe —
        // devolver 0 faria "menor que 30%" bater logo na primeira etapa.
        if (de === 0) continue;
        bruto = (vezes / de) * 100;
      }
    }

    if (compara(bruto, rule.op, rule.value, rule.value2)) return rule.jumpToBlockId;
  }
  return undefined;
}

/**
 * Compute the next STEP index given a forced jump block id (já agregado pelo
 * caller a partir de evaluateResponse/evaluateLogic de TODOS os blocos da
 * etapa atual — o último jump não-vazio encontrado, na ordem dos blocos).
 * Jump targets são block ids; resolvemos em qual etapa aquele bloco vive,
 * já que a navegação agora acontece por etapa (que pode agrupar vários blocos).
 */
export function nextStepIndex(steps: QuizStep[], state: QuizRunState, forcedJumpBlockId?: string): number {
  if (forcedJumpBlockId) {
    const idx = findStepIndexForBlock(steps, forcedJumpBlockId);
    if (idx >= 0) return idx;
  }
  return Math.min(state.currentStepIndex + 1, steps.length - 1);
}

/**
 * Exibição condicional: o bloco só é mostrado quando a condição sobre uma
 * resposta anterior é verdadeira. Sem condição (ou desativada) → sempre visível.
 * Resposta ainda inexistente → condição não satisfeita (bloco fica oculto),
 * exceto para 'neq', que é verdadeiro quando a resposta difere do alvo.
 */
export function isBlockVisible(block: QuizBlock, responses: QuizResponses, scope: VariableScope = {}): boolean {
  const cond = block.showIf;
  if (!cond?.enabled) return true;
  if (cond.useFormula) {
    if (!cond.expression) return true;
  } else if (!cond.fieldBlockId) {
    return true;
  }
  // Modo fórmula: compara o RESULTADO de uma expressão (cruzando várias variáveis,
  // ex.: IMC) em vez da resposta crua de um único bloco anterior.
  const raw: unknown = cond.useFormula ? evaluateExpression(cond.expression!, scope) : responses[cond.fieldBlockId];
  const asNumber = (v: unknown): number => (Array.isArray(v) ? Number.NaN : Number(v));
  const eq = Array.isArray(raw)
    ? (raw as unknown[]).map(String).includes(String(cond.value))
    : String(raw ?? '') === String(cond.value);
  switch (cond.op) {
    case 'eq':
      return eq;
    case 'neq':
      return !eq;
    case 'contains':
      return Array.isArray(raw)
        ? (raw as unknown[]).map(String).includes(String(cond.value))
        : String(raw ?? '').toLowerCase().includes(String(cond.value).toLowerCase());
    case 'gt':
      return asNumber(raw) > Number(cond.value);
    case 'gte':
      return asNumber(raw) >= Number(cond.value);
    case 'lt':
      return asNumber(raw) < Number(cond.value);
    case 'lte':
      return asNumber(raw) <= Number(cond.value);
    case 'between': {
      const n = asNumber(raw);
      const lo = Number(cond.value);
      const hi = Number(cond.value2 ?? cond.value);
      return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
    }
    default:
      return true;
  }
}

/**
 * Pontuação e etiquetas recalculadas a partir das respostas.
 *
 * Antes a pontuação era acumulada (`score + delta` a cada avanço). Isso só
 * funcionava enquanto o visitante não pudesse voltar: com o botão voltar,
 * responder de novo somava a pontuação uma segunda vez, e a pessoa podia
 * inflar o próprio resultado indo e voltando. Como a pontuação decide a faixa,
 * e a faixa decide a mensagem enviada, o valor não pode depender do caminho
 * percorrido — só das respostas que estão valendo agora.
 */
export function recomputeScore(
  blocks: QuizBlock[],
  responses: QuizResponses,
): { score: number; tags: string[] } {
  let score = 0;
  const tags = new Set<string>();
  for (const b of blocks) {
    if (!(b.id in responses)) continue;
    const r = evaluateResponse(b, responses[b.id]);
    score += r.scoreDelta;
    r.tags.forEach((t) => tags.add(t));
  }
  return { score, tags: [...tags] };
}

/**
 * Percentual da pontuação dentro da faixa ALCANÇÁVEL.
 *
 * Opção com pontuação negativa é legítima — serve para penalizar resposta
 * ruim —, mas `maxPossibleScore` ignora negativos (`Math.max(0, …)`), então
 * `score / max` saía negativo. E percentual negativo não bate em nenhuma
 * faixa: `classifyTier` devolvia `null` e o lead ficava sem classificação e
 * sem mensagem, em silêncio.
 *
 * Normalizar sobre `[min, max]` resolve e NÃO muda nada em quiz sem negativos:
 * ali `min` é 0 e a conta volta a ser `score / max`.
 */
export function scorePercent(score: number, max: number, min = 0): number {
  const amplitude = max - min;
  if (amplitude <= 0) return 0;
  const pct = ((score - min) / amplitude) * 100;
  // Resposta fora da faixa não deveria acontecer, mas se acontecer é melhor
  // grudar nos limites do que produzir um percentual impossível.
  return Math.min(100, Math.max(0, pct));
}

/** Pior pontuação alcançável — simétrica de `maxPossibleScore`. */
export function minPossibleScore(schema: QuizSchema, responses?: QuizResponses): number {
  let min = 0;
  const scope = responses ? resolveScope(schema.blocks, responses) : undefined;
  for (const b of schema.blocks) {
    if (responses && !isBlockVisible(b, responses, scope)) continue;
    const w = b.scoreWeight ?? 1;
    if (b.type === 'single-choice') {
      // Escolha única obriga a marcar uma: o piso é a PIOR opção, não zero.
      const pior = Math.min(0, ...(b.options ?? []).map((o) => o.score ?? 0));
      min += pior * w;
    } else if (b.type === 'multi-choice') {
      // Múltipla deixa não marcar nada, então o piso é a soma só das negativas.
      min += (b.options ?? []).reduce((acc, o) => acc + Math.min(0, o.score ?? 0), 0) * w;
    }
    // `rating` nunca é negativo: o piso é zero, já contado.
  }
  return min;
}

export function classifyTemperature(score: number, max: number, min = 0): 'hot' | 'warm' | 'cold' {
  if (max - min <= 0) return 'cold';
  const pct = scorePercent(score, max, min) / 100;
  if (pct >= 0.7) return 'hot';
  if (pct >= 0.4) return 'warm';
  return 'cold';
}

/**
 * Pontuação máxima alcançável.
 *
 * Com `responses`, ignora os blocos que a exibição condicional esconde deste
 * visitante. Sem elas, soma o quiz inteiro — que é o teto absoluto e o
 * comportamento de sempre.
 *
 * Isto importa mais do que parece: contar pontos inalcançáveis infla o
 * denominador, o percentual sai menor que o real e o lead cai numa faixa mais
 * baixa — e é a faixa que decide qual mensagem de WhatsApp é enviada. Medido
 * num quiz em produção: 6 dos 20 blocos pontuáveis são condicionais.
 */
export function maxPossibleScore(schema: QuizSchema, responses?: QuizResponses): number {
  let max = 0;
  // Escopo real, não `{}`: condição escrita como fórmula (ex. IMC) precisa das
  // variáveis resolvidas para dizer se o bloco aparece.
  const scope = responses ? resolveScope(schema.blocks, responses) : undefined;
  for (const b of schema.blocks) {
    if (responses && !isBlockVisible(b, responses, scope)) continue;
    const w = b.scoreWeight ?? 1;
    if (b.type === 'single-choice') {
      const best = Math.max(0, ...(b.options ?? []).map((o) => o.score ?? 0));
      max += best * w;
    } else if (b.type === 'multi-choice') {
      max += (b.options ?? []).reduce((s, o) => s + Math.max(0, o.score ?? 0), 0) * w;
    } else if (b.type === 'rating') {
      max += (b.maxRating ?? 5) * w;
    }
  }
  return max;
}

/**
 * Faixa em que o lead caiu, pelas regras definidas no quiz.
 *
 * Devolve `null` quando o quiz não define faixas — nesse caso quem manda
 * continua sendo `classifyTemperature`, e nada no comportamento antigo muda.
 */
export function classifyTier(
  score: number,
  max: number,
  tiers: import('./types').ScoreTier[] | undefined,
  min = 0,
): import('./types').ScoreTier | null {
  if (!tiers?.length || max - min <= 0) return null;
  const pct = scorePercent(score, max, min);
  // Da faixa mais alta para a mais baixa: a primeira que o lead alcança é a dele.
  return [...tiers].sort((a, b) => b.minPercent - a.minPercent).find((t) => pct >= t.minPercent) ?? null;
}
