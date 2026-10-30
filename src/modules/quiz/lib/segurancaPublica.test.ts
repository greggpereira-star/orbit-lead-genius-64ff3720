import { describe, it, expect } from "vitest";
import { pontuacaoNoServidor } from "./pontuacaoNoServidor";
import { limitarNome, limitarVariaveis, sessaoValida } from "./entradaPublica";
import { urlSegura } from "./urlSegura";
import type { QuizBlock, QuizSchema } from "../types";

const opt = (id: string, score: number) => ({ id, label: id, score });
const schema = {
  blocks: [
    { id: "a", type: "single-choice", options: [opt("a0", 0), opt("a1", 10)] },
    { id: "b", type: "single-choice", options: [opt("b0", 0), opt("b1", 10)] },
  ] as unknown as QuizBlock[],
} as unknown as QuizSchema;

describe("pontuacaoNoServidor", () => {
  it("ignora o score forjado quando há respostas gravadas", () => {
    const r = pontuacaoNoServidor(schema, { a: "a0", b: "b0" }, 20);
    expect(r.score).toBe(0);
    expect(r.recalculado).toBe(true);
  });
  it("recalcula o valor verdadeiro a partir das respostas", () => {
    expect(pontuacaoNoServidor(schema, { a: "a1", b: "b1" }, 0).score).toBe(20);
  });
  it("sem respostas, prende o valor do cliente ao intervalo alcançável", () => {
    expect(pontuacaoNoServidor(schema, null, 9999).score).toBe(20);
    expect(pontuacaoNoServidor(schema, null, -50).score).toBe(0);
    expect(pontuacaoNoServidor(schema, {}, "abc").score).toBe(0);
    expect(pontuacaoNoServidor(schema, null, NaN).score).toBe(0);
  });
});

describe("entrada pública", () => {
  it("limita nome e variáveis", () => {
    expect(limitarNome("x".repeat(500))).toHaveLength(100);
    expect(limitarNome({ a: 1 })).toBe("");
    const muitas = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, "v"]));
    expect(Object.keys(limitarVariaveis(muitas))).toHaveLength(40);
    expect(limitarVariaveis({ a: "y".repeat(1000) }).a).toHaveLength(200);
    expect(limitarVariaveis({ [`k`.repeat(100)]: "v", o: { x: 1 } })).toEqual({});
    expect(limitarVariaveis([1, 2])).toEqual({});
  });
  it("valida sessão", () => {
    expect(sessaoValida("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(sessaoValida("x")).toBe(false);
    expect(sessaoValida("a".repeat(500))).toBe(false);
    expect(sessaoValida(undefined)).toBe(false);
  });
});

describe("urlSegura", () => {
  it("bloqueia esquemas perigosos, inclusive disfarçados", () => {
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " java\tscript:alert(1)", "data:text/html,<script>", "vbscript:x"]) {
      expect(urlSegura(u)).toBeNull();
    }
  });
  it("aceita http, https, mailto, tel e relativas", () => {
    for (const u of ["https://wa.me/5527", "http://a.com", "mailto:a@b.com", "tel:+5527", "/obrigado", "wa.me/5527"]) {
      expect(urlSegura(u)).toBe(u);
    }
  });
  it("vazio vira null", () => {
    expect(urlSegura("  ")).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });
});
