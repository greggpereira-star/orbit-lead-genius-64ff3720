import { describe, it, expect } from "vitest";
import { saltosEntreEtapas, saltosParaTras, etapasEmCiclo, listarEtapas } from "./ciclosDeSalto";
import type { QuizBlock, QuizStep } from "../types";

const etapas = (...ids: string[][]): QuizStep[] =>
  ids.map((blockIds, i) => ({ id: `s${i + 1}`, blockIds }) as QuizStep);

describe("saltosEntreEtapas", () => {
  it("traduz salto de opção de bloco para etapa", () => {
    const blocos = [
      { id: "a", type: "single-choice", options: [{ id: "o1", label: "x", jumpToBlockId: "c" }] },
      { id: "b", type: "heading" },
      { id: "c", type: "heading" },
    ] as unknown as QuizBlock[];
    expect(saltosEntreEtapas(etapas(["a"], ["b"], ["c"]), blocos)).toEqual([{ de: 0, para: 2 }]);
  });

  it("conta também as regras de lógica", () => {
    const blocos = [
      { id: "a", type: "rating", logicRules: [{ jumpToBlockId: "c", op: "gt", value: 5 }] },
      { id: "b", type: "heading" },
      { id: "c", type: "heading" },
    ] as unknown as QuizBlock[];
    expect(saltosEntreEtapas(etapas(["a"], ["b"], ["c"]), blocos)).toEqual([{ de: 0, para: 2 }]);
  });

  it("ignora salto para bloco que não existe — outra checagem cuida disso", () => {
    const blocos = [
      {
        id: "a",
        type: "single-choice",
        options: [{ id: "o1", label: "x", jumpToBlockId: "sumiu" }],
      },
    ] as unknown as QuizBlock[];
    expect(saltosEntreEtapas(etapas(["a"]), blocos)).toEqual([]);
  });
});

describe("saltosParaTras", () => {
  it("pega o salto que volta e o que aponta para a própria etapa", () => {
    const s = [
      { de: 3, para: 1 },
      { de: 2, para: 2 },
      { de: 0, para: 4 },
    ];
    expect(saltosParaTras(s)).toEqual([
      { de: 3, para: 1 },
      { de: 2, para: 2 },
    ]);
  });
});

describe("etapasEmCiclo", () => {
  it("funil só para frente não tem laço", () => {
    expect(
      etapasEmCiclo([
        { de: 0, para: 2 },
        { de: 1, para: 3 },
      ]),
    ).toEqual([]);
  });

  it("um salto para trás sozinho NÃO é laço — falta o caminho de volta por salto", () => {
    // 3 volta para 1, mas nada em 1 salta para 3: quem volta segue o fluxo
    // normal e sai. Acusar aqui condenaria o "volte e corrija", que é legítimo.
    expect(etapasEmCiclo([{ de: 3, para: 1 }])).toEqual([]);
  });

  it("ida e volta por salto fecham o laço", () => {
    expect(
      etapasEmCiclo([
        { de: 1, para: 3 },
        { de: 3, para: 1 },
      ]),
    ).toEqual([1, 3]);
  });

  it("laço de três etapas", () => {
    expect(
      etapasEmCiclo([
        { de: 0, para: 1 },
        { de: 1, para: 2 },
        { de: 2, para: 0 },
      ]),
    ).toEqual([0, 1, 2]);
  });

  it("etapa que salta para si mesma é laço de uma", () => {
    expect(etapasEmCiclo([{ de: 2, para: 2 }])).toEqual([2]);
  });

  it("não trava nem acusa demais num grafo com vários caminhos", () => {
    const s = [
      { de: 0, para: 1 },
      { de: 0, para: 2 },
      { de: 1, para: 3 },
      { de: 2, para: 3 },
      { de: 3, para: 4 },
    ];
    expect(etapasEmCiclo(s)).toEqual([]);
  });
});

describe("listarEtapas", () => {
  it("uma, duas e muitas", () => {
    expect(listarEtapas([1])).toBe("Etapa 2");
    expect(listarEtapas([1, 4])).toBe("Etapas 2 e 5");
    expect(listarEtapas([0, 2, 6])).toBe("Etapas 1, 3 e 7");
  });
});
