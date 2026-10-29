import { isBlockVisible, type QuizResponses } from '../engine';
import type { QuizBlock, QuizStep } from '../types';

/** Blocos que pedem uma resposta: só as etapas que têm um deles contam como "pergunta". */
const TIPOS_DE_PERGUNTA = new Set([
  'single-choice',
  'multi-choice',
  'short-text',
  'long-text',
  'email',
  'phone',
  'rating',
  'weight',
  'height',
  'video-answer',
  'form',
]);

/**
 * "Pergunta x de y" sem contar a capa, o aviso e o resultado.
 *
 * A barra dividia pelo total de etapas (16 neste quiz) e a pessoa respondia
 * 8 ou 9: o número que ela via nunca batia com o caminho dela. Aqui conta só
 * a etapa com pergunta que existe para as respostas dadas até agora, então o
 * par de etapas exclusivas (preço da dupla × do individual) vale por uma.
 *
 * Devolve `null` quando a etapa atual não é uma pergunta.
 */
export function rotuloDePergunta(
  steps: QuizStep[],
  blocks: QuizBlock[],
  indiceAtual: number,
  responses: QuizResponses,
): { atual: number; total: number } | null {
  const ehPergunta = (s: QuizStep) =>
    s.blockIds.some((id) => {
      const b = blocks.find((x) => x.id === id);
      return !!b && TIPOS_DE_PERGUNTA.has(b.type) && isBlockVisible(b, responses);
    });

  if (!steps[indiceAtual] || !ehPergunta(steps[indiceAtual])) return null;

  let atual = 0;
  let total = 0;
  steps.forEach((s, i) => {
    if (!ehPergunta(s)) return;
    total += 1;
    if (i <= indiceAtual) atual += 1;
  });
  return { atual, total };
}
