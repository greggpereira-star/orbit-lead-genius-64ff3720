import { describe, expect, it } from "vitest";
import { designVars } from "./designVars";
import type { QuizDesign } from "../types";

const base = { presetId: "mono", primary: "#000", background: "#fff", surface: "#eee", text: "#000", muted: "#777", radius: 4, fontHeading: "X", fontBody: "Y", buttonStyle: "solid", progressStyle: "bar" } as unknown as QuizDesign;

describe("escala de título e texto", () => {
  it("o padrão (28 e 16) não altera nada: escala 1", () => {
    const v = designVars({ ...base, titleSize: 28, contentSize: 16 }) as Record<string, string>;
    expect(v["--quiz-title-scale"]).toBe("1");
    expect(v["--quiz-content-scale"]).toBe("1");
  });
  it("sem o campo também vale 1", () => {
    const v = designVars(base) as Record<string, string>;
    expect(v["--quiz-title-scale"]).toBe("1");
    expect(v["--quiz-content-scale"]).toBe("1");
  });
  it("32 e 17 viram a razão sobre o padrão", () => {
    const v = designVars({ ...base, titleSize: 32, contentSize: 17 }) as Record<string, string>;
    expect(Number(v["--quiz-title-scale"])).toBeCloseTo(32 / 28, 5);
    expect(Number(v["--quiz-content-scale"])).toBeCloseTo(17 / 16, 5);
  });
});
