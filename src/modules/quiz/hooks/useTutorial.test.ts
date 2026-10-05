import { describe, it, expect } from "vitest";
import { deveAbrirTutorial, PASSOS_DO_CONSTRUTOR, CHAVE_DO_TUTORIAL } from "./useTutorial";

describe("deveAbrirTutorial", () => {
  it("abre na primeira vez, em tela larga", () => {
    expect(deveAbrirTutorial(1440, () => null)).toBe(true);
  });

  it("não abre de novo depois de visto", () => {
    expect(deveAbrirTutorial(1440, () => "2026-10-05T00:00:00.000Z")).toBe(false);
  });

  it("não abre em tela estreita — os alvos nem estão no DOM", () => {
    // O painel lateral é `hidden lg:block`; abaixo de 1024 o tutorial apontaria
    // para elementos que não existem.
    expect(deveAbrirTutorial(1023, () => null)).toBe(false);
    expect(deveAbrirTutorial(1024, () => null)).toBe(true);
  });

  it("não abre quando o armazenamento lança", () => {
    expect(
      deveAbrirTutorial(1440, () => {
        throw new Error("storage bloqueado");
      }),
    ).toBe(false);
  });
});

describe("passos do construtor", () => {
  it("tem título e texto em todos", () => {
    for (const p of PASSOS_DO_CONSTRUTOR) {
      expect(p.titulo.length).toBeGreaterThan(3);
      expect(p.texto.length).toBeGreaterThan(20);
    }
  });

  it("aponta só para âncoras que o construtor declara", () => {
    // Mantém esta lista em par com os `data-tutorial` da rota do construtor.
    const ancoras = new Set(["etapas", "componentes", "canvas", "inspetor", "design", "publicar"]);
    for (const p of PASSOS_DO_CONSTRUTOR) {
      if (p.alvo) expect(ancoras.has(p.alvo), `âncora desconhecida: ${p.alvo}`).toBe(true);
    }
  });

  it("versiona a chave, para poder reapresentar um tutorial reescrito", () => {
    expect(CHAVE_DO_TUTORIAL).toMatch(/:v\d+$/);
  });
});
