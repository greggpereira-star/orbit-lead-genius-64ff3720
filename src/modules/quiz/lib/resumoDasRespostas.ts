import type { QuizBlock } from "../types";

/**
 * Tipos que entram no bloco de Resumo.
 *
 * Vive aqui, e não dentro do player, porque o inspetor precisa da MESMA lista
 * para montar a escolha de quais perguntas aparecem. Duas cópias é como o
 * produto já perdeu o "Obrigatório" da escolha única, a origem de lógica do
 * vídeo-resposta e o peso da pontuação: concordam no dia em que são escritas e
 * divergem na primeira adição.
 */
export const BLOCOS_QUE_PERGUNTAM = new Set<QuizBlock["type"]>([
  "single-choice",
  "multi-choice",
  "rating",
  "short-text",
  "long-text",
  "email",
  "phone",
  "weight",
  "height",
]);

export interface LinhaDoResumo {
  /** De qual bloco veio — é por ele que o autor escolhe o que mostrar. */
  blockId: string;
  pergunta: string;
  resposta: string;
}

/**
 * O que o visitante respondeu, pronto para repetir na tela.
 *
 * Mostra o RÓTULO da opção, não o id guardado: `o3` não diz nada a ninguém.
 *
 * Cada linha carrega o `blockId`. Antes a lista era só pergunta e resposta, e
 * o filtro do autor (`resumirBlocos`) guardava ÍNDICE dentro dela — mas só
 * entra na lista quem FOI respondido, então o índice 2 é uma pergunta para
 * quem respondeu tudo e outra para quem pulou uma. O mesmo filtro mostraria
 * respostas diferentes para visitantes diferentes.
 */
export function montarResumo(
  blocks: QuizBlock[],
  responses: Record<string, unknown>,
): LinhaDoResumo[] {
  const linhas: LinhaDoResumo[] = [];
  for (const b of blocks) {
    if (!BLOCOS_QUE_PERGUNTAM.has(b.type)) continue;
    const v = responses[b.id];
    if (v === undefined || v === null || v === "") continue;
    const rotuloDaOpcao = (id: string) => (b.options ?? []).find((o) => o.id === id)?.label ?? id;

    let resposta: string;
    if (Array.isArray(v)) resposta = v.map((x) => rotuloDaOpcao(String(x))).join(", ");
    else if (b.options?.length) resposta = rotuloDaOpcao(String(v));
    else if (typeof v === "object" || typeof v === "boolean") continue;
    else resposta = String(v);

    if (!resposta.trim()) continue;
    linhas.push({ blockId: b.id, pergunta: b.title?.trim() || b.type, resposta });
  }
  return linhas;
}
