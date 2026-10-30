import { describe, it, expect } from "vitest";
import { aplicarCampo } from "./camposDeSettings";

describe("aplicarCampo", () => {
  it("texto: aplica com trim e remove quando vazio", () => {
    const s: Record<string, unknown> = { webhook_url: "x" };
    aplicarCampo(s, "seo_title", "  Olá ");
    aplicarCampo(s, "webhook_url", "   ");
    expect(s).toEqual({ seo_title: "Olá" });
  });
  it("lista de faixas não quebra (antes: TypeError .trim)", () => {
    const faixas = [{ id: "a" }];
    const s: Record<string, unknown> = {};
    expect(() => aplicarCampo(s, "score_tiers", faixas)).not.toThrow();
    expect(s.score_tiers).toBe(faixas);
    aplicarCampo(s, "score_tiers", []);
    expect(s).toEqual({});
  });
  it("booleano não quebra; false remove", () => {
    const s: Record<string, unknown> = {};
    expect(() => aplicarCampo(s, "mostrar_assinatura", true)).not.toThrow();
    expect(s.mostrar_assinatura).toBe(true);
    aplicarCampo(s, "mostrar_assinatura", false);
    expect(s).toEqual({});
  });
  it("undefined não mexe", () => {
    const s: Record<string, unknown> = { a: 1 };
    aplicarCampo(s, "a", undefined);
    expect(s).toEqual({ a: 1 });
  });
});
