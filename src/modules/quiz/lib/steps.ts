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
    const indexOf = new Map(schema.blocks.map((b, i) => [b.id, i]));
    // Sanea etapas: remove blockIds que apontam pra blocos que não existem mais
    // (referência pendente deixaria uma etapa fantasma vazia no canvas/painel), e
    // descarta etapas que ficaram sem nenhum bloco válido.
    const cleaned = schema.steps
      .map((s) => ({ ...s, blockIds: s.blockIds.filter((id) => indexOf.has(id)) }))
      .filter((s) => s.blockIds.length > 0);
    // Qualquer bloco ainda não coberto por nenhuma etapa vira sua própria etapa —
    // nunca some do builder.
    const covered = new Set(cleaned.flatMap((s) => s.blockIds));
    const orphans = schema.blocks
      .filter((b) => !covered.has(b.id))
      .map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
    if (orphans.length === 0) return cleaned;
    // Reinsere os órfãos na posição que corresponde à ordem em `blocks` (usando o
    // menor índice de bloco de cada etapa como chave), pra que um bloco que era o
    // primeiro em `blocks` reapareça como primeira etapa — não jogado no final.
    const keyOf = (s: QuizStep) => Math.min(...s.blockIds.map((id) => indexOf.get(id) ?? Number.MAX_SAFE_INTEGER));
    return [...cleaned, ...orphans].sort((a, b) => keyOf(a) - keyOf(b));
  }
  return schema.blocks.map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
}

export function findStepIndexForBlock(steps: QuizStep[], blockId: string): number {
  return steps.findIndex((s) => s.blockIds.includes(blockId));
}
