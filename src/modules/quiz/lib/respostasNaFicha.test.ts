import { describe, expect, it } from "vitest";
import type { QuizSchema } from "../types";
import { respostasDoQuiz } from "./respostasNaFicha";

const schema = {
  blocks: [
    { id: "capa", type: "intro", title: "Bem-vinda" },
    {
      id: "tec",
      type: "single-choice",
      title: "Qual técnica você usa?",
      options: [
        { id: "tec-dupla", label: "Dupla técnica" },
        { id: "tec-uma", label: "Uma só" },
      ],
    },
    {
      id: "multi",
      type: "multi-choice",
      title: "Onde atua?",
      options: [
        { id: "a", label: "Clínica" },
        { id: "b", label: "Home care" },
      ],
    },
    { id: "cidade", type: "short-text", title: "Sua cidade?" },
    { id: "form", type: "form", title: "Seus dados" },
  ],
} as unknown as QuizSchema;

describe("respostasDoQuiz", () => {
  it("troca id de bloco e de opção pelo texto, na ordem do funil", () => {
    const r = respostasDoQuiz(schema, {
      cidade: "Linhares",
      multi: ["a", "b"],
      tec: "tec-dupla",
    });
    expect(r.map((a) => [a.short, a.value])).toEqual([
      ["Qual técnica você usa", "Dupla técnica"],
      ["Onde atua", "Clínica; Home care"],
      ["Sua cidade", "Linhares"],
    ]);
  });

  it("não repete o contato nem lista o que não foi respondido", () => {
    const r = respostasDoQuiz(schema, {
      form: { name: "Ana", email: "a@b.c", phone: "27999" },
      intro: true,
      tec: "",
    });
    expect(r).toEqual([]);
  });

  it("sem schema ou sem respostas devolve vazio", () => {
    expect(respostasDoQuiz(null, { tec: "x" })).toEqual([]);
    expect(respostasDoQuiz(schema, null)).toEqual([]);
  });
});
