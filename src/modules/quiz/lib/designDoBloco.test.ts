import { describe, expect, it } from "vitest";
import type { QuizBlock, QuizDesign } from "../types";
import { designDoBloco } from "./blockStyle";

const design = {
  text: "#3c3c3f",
  muted: "#5f5b58",
  background: "#f2eee9",
  surface: "#ffffff",
  primary: "#8d695c",
} as QuizDesign;
const bloco = (blockStyle?: QuizBlock["blockStyle"]) =>
  ({ id: "b", type: "heading", blockStyle }) as unknown as QuizBlock;

describe("designDoBloco", () => {
  it("sem cor própria devolve o MESMO design, sem copiar", () => {
    expect(designDoBloco(design, bloco())).toBe(design);
    expect(designDoBloco(design, bloco({ background: "#fff" }))).toBe(design);
  });

  it("a cor escolhida vira o texto do tema e o secundário sai dela, em hex", () => {
    const d = designDoBloco(design, bloco({ textColor: "#be1858" }));
    expect(d.text).toBe("#be1858");
    expect(d.muted).toMatch(/^#[0-9a-f]{6}$/);
    expect(d.muted).not.toBe(design.muted);
    expect(d.primary).toBe(design.primary);
  });

  it("valor que não é hex não quebra o tema", () => {
    expect(designDoBloco(design, bloco({ textColor: "red" }))).toBe(design);
  });
});
