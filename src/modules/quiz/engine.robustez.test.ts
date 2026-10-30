import { describe, it, expect } from "vitest";
import { classifyTier, evaluateResponse, isBlockVisible, scorePercent } from "./engine";
import { evaluateExpression, interpolateText, resolveScope } from "./lib/variables";
import type { QuizBlock } from "./types";

describe("scorePercent", () => {
  it("não perde o corte exato por ponto flutuante", () => {
    expect(scorePercent(29, 100)).toBe(29);
    expect(scorePercent(57, 100)).toBe(57);
    expect(scorePercent(58, 100)).toBe(58);
    expect(scorePercent(29, 50)).toBe(58);
    const tiers = [
      { id: "a", label: "A", minPercent: 29, color: "#000" },
      { id: "b", label: "B", minPercent: 0, color: "#000" },
    ] as never;
    expect(classifyTier(29, 100, tiers, 0)?.label).toBe("A");
  });
});

describe("evaluateResponse", () => {
  const rating = { id: "r", type: "rating", maxRating: 5 } as QuizBlock;
  const multi = { id: "m", type: "multi-choice", options: [{ id: "x", label: "x", score: 5 }] } as unknown as QuizBlock;
  it("NaN e fora de faixa não envenenam a nota", () => {
    expect(evaluateResponse(rating, NaN).scoreDelta).toBe(0);
    expect(evaluateResponse(rating, "4").scoreDelta).toBe(4);
    expect(evaluateResponse(rating, 99).scoreDelta).toBe(5);
    expect(evaluateResponse(rating, -3).scoreDelta).toBe(0);
    expect(evaluateResponse(rating, "").scoreDelta).toBe(0);
  });
  it("id repetido em múltipla escolha soma uma vez", () => {
    expect(evaluateResponse(multi, ["x", "x"]).scoreDelta).toBe(5);
  });
});

describe("showIf numérico com resposta vazia", () => {
  const bloco = (op: string) =>
    ({ id: "b", type: "paragraph", showIf: { enabled: true, fieldBlockId: "a", op, value: 5 } }) as unknown as QuizBlock;
  it("vazio e nulo não contam como zero", () => {
    expect(isBlockVisible(bloco("lt"), { a: "" })).toBe(false);
    expect(isBlockVisible(bloco("lt"), { a: null })).toBe(false);
    expect(isBlockVisible(bloco("lt"), { a: 3 })).toBe(true);
  });
});

describe("fórmulas", () => {
  it("expressão malformada vira NaN em vez de um número qualquer", () => {
    expect(evaluateExpression("0,5*10", {})).toBeNaN();
    expect(evaluateExpression("peso 2", { peso: 7 })).toBeNaN();
    expect(evaluateExpression("idade > 18", { idade: 5 })).toBeNaN();
  });
  it("expressões válidas continuam funcionando", () => {
    expect(evaluateExpression("peso/(altura/100)^2", { peso: 80, altura: 200 })).toBe(20);
    expect(evaluateExpression("max(1, 2, 3) + round(2.5)", {})).toBe(6);
    expect(evaluateExpression("-2+5", {})).toBe(3);
  });
  it("decimal com vírgula em variável numérica vira número", () => {
    const blocks = [{ id: "p", type: "weight", outputVariable: "peso" }] as unknown as QuizBlock[];
    expect(resolveScope(blocks, { p: "72,5" }).peso).toBe(72.5);
  });
  it("{{constructor}} não vaza o protótipo", () => {
    expect(interpolateText("a {{constructor}} b {{toString}}", {})).toBe("a  b ");
  });
  it("função com nome do protótipo não executa", () => {
    expect(evaluateExpression("constructor(1)", {})).toBeNaN();
  });
});
