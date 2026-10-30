import { describe, it, expect } from "vitest";
import { recomputeScore, maxPossibleScore } from "./engine";
import type { QuizBlock, QuizSchema } from "./types";

const opt = (id: string, score: number, tag?: string) => ({ id, label: id, score, tag });
const blocos = [
  { id: "a", type: "single-choice", options: [opt("a0", 0), opt("a1", 1)] },
  {
    id: "b",
    type: "single-choice",
    options: [opt("b0", 10, "TAG_B")],
    showIf: { enabled: true, fieldBlockId: "a", op: "eq", value: "a1" },
  },
] as unknown as QuizBlock[];

describe("recomputeScore e bloco que ficou oculto", () => {
  it("resposta velha de bloco oculto não pontua nem etiqueta", () => {
    // viu b com a=a1, respondeu, voltou e trocou a para a0
    const r = recomputeScore(blocos, { a: "a0", b: "b0" });
    expect(r.score).toBe(0);
    expect(r.tags).not.toContain("TAG_B");
  });
  it("bloco visível continua pontuando", () => {
    const r = recomputeScore(blocos, { a: "a1", b: "b0" });
    expect(r.score).toBe(11);
    expect(r.tags).toContain("TAG_B");
  });
  it("score nunca passa do teto do caminho", () => {
    const resp = { a: "a0", b: "b0" };
    const max = maxPossibleScore({ blocks: blocos } as unknown as QuizSchema, resp);
    expect(recomputeScore(blocos, resp).score).toBeLessThanOrEqual(max);
  });
});
