import type { BlockOption, QuizBlock, QuizSchema } from './types';

export type QuizResponses = Record<string, unknown>;

export interface QuizRunState {
  currentIndex: number;
  responses: QuizResponses;
  score: number;
  tags: string[];
  history: string[]; // block ids visited
}

export function createInitialState(): QuizRunState {
  return { currentIndex: 0, responses: {}, score: 0, tags: [], history: [] };
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
 * Compute the next block index given the current state + optional forced jump.
 */
export function nextIndex(schema: QuizSchema, state: QuizRunState, forcedJumpBlockId?: string): number {
  const blocks = schema.blocks;
  if (forcedJumpBlockId) {
    const idx = blocks.findIndex((b) => b.id === forcedJumpBlockId);
    if (idx >= 0) return idx;
  }
  const current = blocks[state.currentIndex];
  if (current) {
    const logicJump = evaluateLogic(current, state.responses);
    if (logicJump) {
      const idx = blocks.findIndex((b) => b.id === logicJump);
      if (idx >= 0) return idx;
    }
  }
  return Math.min(state.currentIndex + 1, blocks.length - 1);
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
