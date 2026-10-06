import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BLOCK_LIBRARY } from "../blocks-library";

/**
 * Todo bloco da paleta precisa ser desenhado nos DOIS renderizadores.
 *
 * O canvas e o player têm `switch (block.type)` separados, e os dois caem num
 * `default` que devolve só o título. Quando um tipo existe num e não no outro,
 * nada quebra: o autor monta a tela, vê um título solto e descobre o
 * componente de verdade só depois de publicar.
 *
 * Foi assim com nove tipos de uma vez — `arrow`, `brand`, `cards`, `emoji`,
 * `grid`, `indicator`, `scheduling`, `social` e `summary` —, todos ligados ao
 * player e nenhum ao canvas. Ninguém percebeu porque compila, passa no tipo e
 * roda.
 */
const canvas = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

/** Os `case 'x':` de um arquivo. */
function casos(fonte: string): Set<string> {
  return new Set([...fonte.matchAll(/case ['"]([a-z-]+)['"]:/g)].map((m) => m[1]));
}

const noCanvas = casos(canvas);
const noPlayer = casos(player);

/** O Container é do construtor: no player os filhos são achatados antes. */
const SO_NO_CANVAS = new Set(["container"]);

describe("todo bloco da paleta é desenhado nos dois lados", () => {
  const tipos = [...new Set(BLOCK_LIBRARY.map((b) => b.type))];

  it.each(tipos)("%s tem desenho no canvas", (tipo) => {
    expect(noCanvas.has(tipo), `${tipo} cai no default do canvas: o autor vê só o título`).toBe(
      true,
    );
  });

  it.each(tipos.filter((t) => !SO_NO_CANVAS.has(t)))("%s tem desenho no player", (tipo) => {
    expect(noPlayer.has(tipo), `${tipo} cai no default do player: o visitante vê só o título`).toBe(
      true,
    );
  });
});
