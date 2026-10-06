import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { perguntasDoSchema } from "./csvDeRespostas";
import type { QuizSchema } from "../types";
import { BLOCK_LIBRARY } from "../blocks-library";

/**
 * Todo bloco que COLETA resposta precisa propagar o valor para o pai.
 *
 * No `QuizPlayer`, o `draftValue` decide o que cada bloco manda para cima. O
 * que não está lá cai no `return true` genérico, e o valor real nunca chega ao
 * banco: a tela funciona, o visitante responde, e a resposta some sem erro
 * nenhum.
 *
 * Foi o que aconteceu com o `video-answer`. O vídeo subia, a tela dizia "Vídeo
 * enviado", e o `p_responses` chegava ao servidor sem o bloco — descoberto
 * interceptando a requisição, porque nenhuma tela acusava.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

/** Corpo do `draftValue`, que é quem decide o que sobe. */
const corpoDoDraft = (() => {
  const i = player.indexOf("const draftValue = useMemo(");
  const j = player.indexOf("}, [block.type", i);
  expect(i, "draftValue não encontrado — o teste precisa ser reapontado").toBeGreaterThan(-1);
  return player.slice(i, j);
})();

/** Os tipos que o CSV trata como pergunta, montados a partir da paleta real. */
const tiposQueColetam = (() => {
  const schema = {
    blocks: BLOCK_LIBRARY.map((d, i) => ({ ...d.create(), id: `b${i}` })),
    design: {},
  } as unknown as QuizSchema;
  return [...new Set(perguntasDoSchema(schema).map((b) => b.type))];
})();

describe("resposta coletada tem de chegar ao pai", () => {
  it("a lista de tipos que coletam não está vazia", () => {
    expect(tiposQueColetam.length).toBeGreaterThan(5);
  });

  it.each(tiposQueColetam)("%s aparece no draftValue do player", (tipo) => {
    expect(
      corpoDoDraft.includes(`'${tipo}'`),
      `${tipo} coleta resposta mas cai no \`return true\` do draftValue: ` +
        `o valor nunca chega ao banco e nada acusa`,
    ).toBe(true);
  });
});
