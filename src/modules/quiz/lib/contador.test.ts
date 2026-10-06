import { describe, it, expect } from "vitest";
import { alvoDoContador, restanteDoContador, jaPodeAparecer } from "./contador";

const T0 = 1_700_000_000_000;

describe("alvoDoContador", () => {
  it("soma os minutos ao instante da montagem", () => {
    expect(alvoDoContador(T0, undefined, 15)).toBe(T0 + 15 * 60_000);
  });

  it("uma data final explícita vence os minutos", () => {
    const iso = new Date(T0 + 3_600_000).toISOString();
    expect(alvoDoContador(T0, iso, 15)).toBe(T0 + 3_600_000);
  });

  it("data inválida vira contagem relativa em vez de NaN na tela", () => {
    expect(alvoDoContador(T0, "não é data", 10)).toBe(T0 + 600_000);
  });

  it("minutos negativos não puxam o alvo para trás", () => {
    expect(alvoDoContador(T0, undefined, -5)).toBe(T0);
  });
});

describe("restanteDoContador", () => {
  it("conta para baixo conforme o tempo passa", () => {
    // O defeito que isto tranca: o alvo era recalculado a cada render, então a
    // diferença dava sempre a mesma e o contador ficava congelado em 15:00.
    const alvo = alvoDoContador(T0, undefined, 15);
    const inicio = restanteDoContador(alvo, T0);
    const umMinutoDepois = restanteDoContador(alvo, T0 + 60_000);
    expect(inicio.minutos).toBe(15);
    expect(umMinutoDepois.minutos).toBe(14);
  });

  it("quebra em horas, minutos e segundos", () => {
    const r = restanteDoContador(T0 + 3_661_000, T0);
    expect(r).toMatchObject({ horas: 1, minutos: 1, segundos: 1 });
  });

  it("não vai a negativo depois de zerar", () => {
    const r = restanteDoContador(T0, T0 + 10_000);
    expect(r).toMatchObject({ horas: 0, minutos: 0, segundos: 0, terminou: true });
  });
});

describe("jaPodeAparecer", () => {
  it("sem atraso configurado, aparece de imediato", () => {
    expect(jaPodeAparecer(T0, T0, 0)).toBe(true);
    expect(jaPodeAparecer(T0, T0)).toBe(true);
  });

  it("com atraso, segura até o tempo passar", () => {
    expect(jaPodeAparecer(T0, T0 + 2_000, 3)).toBe(false);
    expect(jaPodeAparecer(T0, T0 + 3_000, 3)).toBe(true);
  });
});
