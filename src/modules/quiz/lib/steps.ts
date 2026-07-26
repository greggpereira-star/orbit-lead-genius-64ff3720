import type { QuizBlock, QuizStep } from '../types';

/**
 * Deriva a lista de etapas de um schema. Se `schema.steps` já existir, usa-o
 * (garantindo que nenhum bloco fique órfão — qualquer block.id não coberto
 * vira sua própria etapa, anexada ao final). Se não existir, cai no
 * comportamento retroativo: cada bloco é sua própria etapa, na ordem de
 * `schema.blocks` — preserva 100% o comportamento de qualquer quiz já
 * existente, sem precisar de migração de dados.
 */
export function getSteps(
  schema: { blocks: QuizBlock[]; steps?: QuizStep[] },
  /**
   * `keepEmpty` preserva etapas sem nenhum bloco. Só o BUILDER usa isso: criar
   * uma etapa e depois escolher os componentes dela é o fluxo normal de montagem,
   * e sem isso a etapa recém-criada era podada antes de o usuário conseguir pôr
   * o primeiro bloco. Preview e player continuam podando — uma tela vazia nunca
   * deve chegar a quem responde o quiz.
   */
  opts?: { keepEmpty?: boolean },
): QuizStep[] {
  if (schema.steps && schema.steps.length > 0) {
    const indexOf = new Map(schema.blocks.map((b, i) => [b.id, i]));
    // Sanea etapas: remove blockIds que apontam pra blocos que não existem mais
    // (referência pendente deixaria uma etapa fantasma vazia no canvas/painel), e
    // descarta etapas que ficaram sem nenhum bloco válido.
    const cleaned = schema.steps
      .map((s) => ({ ...s, blockIds: s.blockIds.filter((id) => indexOf.has(id)) }))
      .filter((s) => opts?.keepEmpty || s.blockIds.length > 0);
    // Qualquer bloco ainda não coberto por nenhuma etapa vira sua própria etapa —
    // nunca some do builder. Um bloco "filho" de um Container (childBlockIds)
    // também conta como coberto: ele nunca entra no blockIds de uma etapa, só na
    // lista do Container que o contém — sem isso, viraria uma etapa órfã duplicada.
    const containerChildIds = schema.blocks.flatMap((b) => b.childBlockIds ?? []);
    const covered = new Set([...cleaned.flatMap((s) => s.blockIds), ...containerChildIds]);
    const orphans = schema.blocks
      .filter((b) => !covered.has(b.id))
      .map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
    if (orphans.length === 0) return cleaned;
    // Reinsere os órfãos na posição que corresponde à ordem em `blocks` (usando o
    // menor índice de bloco de cada etapa como chave), pra que um bloco que era o
    // primeiro em `blocks` reapareça como primeira etapa — não jogado no final.
    // Etapa vazia não tem bloco de onde tirar chave: herda a posição logo depois
    // da anterior, senão Math.min de lista vazia (Infinity) a jogaria pro fim e
    // ela pularia de lugar sozinha assim que um bloco órfão aparecesse.
    const keys = new Map<string, number>();
    let previous = -1;
    for (const s of cleaned) {
      const key = s.blockIds.length
        ? Math.min(...s.blockIds.map((id) => indexOf.get(id) ?? Number.MAX_SAFE_INTEGER))
        : previous + 0.5;
      keys.set(s.id, key);
      previous = key;
    }
    for (const s of orphans) keys.set(s.id, indexOf.get(s.blockIds[0]) ?? Number.MAX_SAFE_INTEGER);
    return [...cleaned, ...orphans].sort((a, b) => (keys.get(a.id) ?? 0) - (keys.get(b.id) ?? 0));
  }
  return schema.blocks.map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
}

export function findStepIndexForBlock(steps: QuizStep[], blockId: string): number {
  return steps.findIndex((s) => s.blockIds.includes(blockId));
}
