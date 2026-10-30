import type { QuizSchema, QuizStep } from "../types";

/**
 * Reconcilia `schema.blocks` com a lista de etapas montada pelo construtor.
 *
 * `steps` é a fonte de verdade de agrupamento e ordem; `blocks` guarda o
 * conteúdo. Regra de ouro: NENHUM bloco que exista em `prev.blocks` some. Filho
 * de Container nunca está no `blockIds` de uma etapa (só no `childBlockIds` do
 * pai), então precisa ser levado junto com o pai — antes ele era descartado, o
 * Container ficava apontando para blocos inexistentes e o autosave gravava a
 * perda. O que sobrar sem dono vira etapa própria no final.
 */
export function reconciliarEtapas(prev: QuizSchema, rawSteps: QuizStep[]): QuizSchema {
  const existing = new Set(prev.blocks.map((b) => b.id));
  const blockMap = new Map(prev.blocks.map((b) => [b.id, b]));
  const cleaned = rawSteps.map((s) => ({ ...s, blockIds: s.blockIds.filter((id) => existing.has(id)) }));

  const containerChildIds = prev.blocks.flatMap((b) => b.childBlockIds ?? []);
  const covered = new Set([...cleaned.flatMap((s) => s.blockIds), ...containerChildIds]);
  const orphanSteps = prev.blocks
    .filter((b) => !covered.has(b.id))
    .map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
  const finalSteps = [...cleaned, ...orphanSteps];

  const ordem: string[] = [];
  const visto = new Set<string>();
  const incluir = (id: string) => {
    if (visto.has(id) || !blockMap.has(id)) return;
    visto.add(id);
    ordem.push(id);
    for (const filho of blockMap.get(id)!.childBlockIds ?? []) incluir(filho);
  };
  finalSteps.flatMap((s) => s.blockIds).forEach(incluir);
  // Filho cujo pai não está em nenhuma etapa: mantém o dado, no fim.
  prev.blocks.forEach((b) => incluir(b.id));

  return { ...prev, blocks: ordem.map((id) => blockMap.get(id)!), steps: finalSteps };
}
