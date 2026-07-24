import type { BlockOption, QuizBlock, QuizSchema, QuizStep } from './types';
import { findStepIndexForBlock } from './lib/steps';
import { evaluateExpression, type VariableScope } from './lib/variables';

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
export function evaluateLogic(block: QuizBlock, responses: QuizResponses): string | undefined {
  for (const rule of block.logicRules ?? []) {
    const value = responses[rule.fieldBlockId];
    const target = rule.value;
    let ok = false;
    switch (rule.op) {
      case 'eq':
        ok = String(value) === String(target);
        break;
      case 'neq':
        ok = String(value) !== String(target);
        break;
      case 'contains':
        ok = Array.isArray(value) ? (value as unknown[]).map(String).includes(String(target)) : String(value ?? '').includes(String(target));
        break;
      case 'gt':
        ok = Number(value) > Number(target);
        break;
      case 'lt':
        ok = Number(value) < Number(target);
        break;
    }
    if (ok) return rule.jumpToBlockId;
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

export function classifyTemperature(score: number, max: number): 'hot' | 'warm' | 'cold' {
  if (max <= 0) return 'cold';
  const pct = score / max;
  if (pct >= 0.7) return 'hot';
  if (pct >= 0.4) return 'warm';
  return 'cold';
}

export function maxPossibleScore(schema: QuizSchema): number {
  let max = 0;
  for (const b of schema.blocks) {
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
