import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { classeDeAlinhamento } from "./blockStyle";
import type { QuizBlock } from "../types";

const bloco = (align?: "left" | "center" | "right"): QuizBlock =>
  ({ id: "b1", type: "heading", blockStyle: align ? { align } : undefined }) as QuizBlock;

describe("classeDeAlinhamento", () => {
  it("sem escolha do autor, não marca nada", () => {
    expect(classeDeAlinhamento(bloco())).toBeUndefined();
    expect(classeDeAlinhamento({ id: "b", type: "heading" } as QuizBlock)).toBeUndefined();
  });

  it("com escolha, marca — inclusive quando a escolha é 'center'", () => {
    // 'center' explícito também marca: o autor pode querer centralizar um
    // bloco cujo renderizador alinha à esquerda.
    for (const a of ["left", "center", "right"] as const) {
      expect(classeDeAlinhamento(bloco(a))).toBe("alinhamento-proprio");
    }
  });
});

/**
 * Paridade: canvas e player precisam aplicar a MESMA classe.
 *
 * O defeito que esta funcionalidade conserta nasceu de canvas e player
 * divergirem; um teste que lê os dois arquivos é o que impede a divergência
 * de voltar sem ninguém notar.
 */
describe("paridade entre canvas e player", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const canvas = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");

  it("os dois chamam classeDeAlinhamento", () => {
    expect(player).toContain("classeDeAlinhamento");
    expect(canvas).toContain("classeDeAlinhamento");
  });

  it("a regra de CSS que dá efeito à classe existe", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain(".alinhamento-proprio");
  });
});
