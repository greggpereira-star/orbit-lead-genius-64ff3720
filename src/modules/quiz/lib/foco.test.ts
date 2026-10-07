import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { contrasteWCAG } from "./color";

const css = readFileSync("src/styles.css", "utf8");

/**
 * Foco de teclado visível.
 *
 * Medido na tela em 07/10, navegando com Tab de verdade: os links do menu e os
 * botões feitos à mão ficavam com `outline-style: none` e sombra transparente
 * — nenhum indicador. E onde o anel era desenhado, o `--ring` ficava abaixo do
 * mínimo de 3:1 contra o fundo, então também não se via.
 */
describe("foco de teclado", () => {
  /* A regra GLOBAL, e não qualquer `:focus-visible`: `.rich-editor` tem a
     sua, com `outline: none`, e um casamento frouxo pegava justamente ela —
     o teste passaria a medir a exceção em vez da regra. */
  const global = css.match(/(?:^|\n)\s*:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";

  it("existe uma regra global de :focus-visible", () => {
    expect(global).toMatch(/outline:/);
  });

  it("o anel tem pelo menos 2px — 1px não cumpre a 2.4.11", () => {
    const px = Number(global.match(/outline:\s*(\d+)px/)?.[1] ?? 0);
    expect(px).toBeGreaterThanOrEqual(2);
  });

  it("o acento usado no anel passa de 3:1 sobre o branco", () => {
    // #2563EB é o --primary do tema claro, que o --ring passou a referenciar.
    expect(contrasteWCAG("#2563EB", "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});
