import type { QuizBlock, QuizStep } from '../types';

/**
 * Deriva a lista de etapas de um schema. Se `schema.steps` já existir, usa-o
 * (garantindo que nenhum bloco fique órfão — qualquer block.id não coberto
 * vira sua própria etapa, anexada ao final). Se não existir, cai no
 * comportamento retroativo: cada bloco é sua própria etapa, na ordem de
 * `schema.blocks` — preserva 100% o comportamento de qualquer quiz já
 * existente, sem precisar de migração de dados.
 */
export function getSteps(schema: { blocks: QuizBlock[]; steps?: QuizStep[] }): QuizStep[] {
  if (schema.steps && schema.steps.length > 0) {
    const covered = new Set(schema.steps.flatMap((s) => s.blockIds));
    const missing = schema.blocks.filter((b) => !covered.has(b.id)).map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
    return missing.length > 0 ? [...schema.steps, ...missing] : schema.steps;
  }
  return schema.blocks.map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
}

export function findStepIndexForBlock(steps: QuizStep[], blockId: string): number {
  return steps.findIndex((s) => s.blockIds.includes(blockId));
}
