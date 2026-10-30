import { describe, expect, it } from "vitest";
import { aparelhoPelaLargura, contextoDaVisita } from "./contextoDaVisita";

describe("contextoDaVisita", () => {
  it("aparelho pela largura, nos mesmos limiares do player", () => {
    expect(aparelhoPelaLargura(390)).toBe("mobile");
    expect(aparelhoPelaLargura(820)).toBe("tablet");
    expect(aparelhoPelaLargura(1440)).toBe("desktop");
  });

  it("só leva UTM que existe e corta o excesso", () => {
    expect(contextoDaVisita(390, undefined)).toEqual({ device: "mobile" });
    const c = contextoDaVisita(1200, { utm_source: " meta ", utm_campaign: "x".repeat(300) });
    expect(c.utm_source).toBe("meta");
    expect(c.utm_campaign).toHaveLength(100);
  });
});
