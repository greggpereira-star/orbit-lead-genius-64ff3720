import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizarCustomData } from "./customDataPublico";

describe("sanitizarCustomData", () => {
  it("mantém só as chaves do pixel padrão, com tipo e tamanho", () => {
    expect(
      sanitizarCustomData({
        value: 49.9,
        currency: "brl",
        content_name: "Quiz",
        content_ids: ["a", 7, "b"],
        num_items: 2,
        evil: "x",
        __proto__: { y: 1 },
      }),
    ).toEqual({
      value: 49.9,
      currency: "BRL",
      content_name: "Quiz",
      content_ids: ["a", "b"],
      num_items: 2,
    });
  });

  it("descarta tipo errado, valor absurdo e entrada que não é objeto", () => {
    expect(sanitizarCustomData({ value: "10", currency: "REAIS", num_items: 1.5 })).toBeNull();
    expect(sanitizarCustomData({ value: -1 })).toBeNull();
    expect(sanitizarCustomData([1])).toBeNull();
    expect(sanitizarCustomData(null)).toBeNull();
  });

  it("corta texto e lista longos", () => {
    const r = sanitizarCustomData({
      content_name: "x".repeat(500),
      content_ids: Array.from({ length: 50 }, (_, i) => `i${i}`),
    })!;
    expect((r.content_name as string).length).toBe(120);
    expect((r.content_ids as string[]).length).toBe(20);
  });

  it("a rota pública passa o customData pelo filtro", () => {
    const rota = readFileSync("src/routes/api/public/pixel-event.ts", "utf8");
    expect(rota).toContain("customData: sanitizarCustomData(body.customData)");
    expect(rota).not.toContain("customData: body.customData");
  });
});
