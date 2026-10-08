import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { getSteps } from "./steps";
import type { QuizSchema } from "../types";

/**
 * Etapa sem bloco é uma tela que o usuário criou e ainda não preencheu — não é
 * lixo. O construtor a mantém de propósito; quem poda é o preview/player, que
 * nunca deve mostrar tela em branco a quem responde.
 *
 * O defeito que isto trava: o fluxograma chamava `getSteps(prev)` sem
 * `keepEmpty` em TODAS as suas ações e reescrevia `schema.steps` com o
 * resultado. Bastava abrir o fluxograma e renomear uma etapa para as vazias
 * sumirem — sem erro, sem aviso, sem desfazer.
 */
describe("poda de etapa vazia", () => {
  const schema = {
    blocks: [{ id: "b1", type: "heading" }],
    steps: [
      { id: "s1", blockIds: ["b1"] },
      { id: "s2", blockIds: [] },
      { id: "s3", blockIds: [] },
    ],
  } as unknown as QuizSchema;

  it("sem keepEmpty, as vazias somem", () => {
    expect(getSteps(schema).map((s) => s.id)).toEqual(["s1"]);
  });

  it("com keepEmpty, sobrevivem", () => {
    expect(getSteps(schema, { keepEmpty: true }).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("telas de montagem preservam etapa vazia", () => {
  /* Teste de código-fonte porque o defeito não aparece em nenhuma asserção de
     comportamento: a chamada errada compila, roda e devolve uma lista válida —
     só que menor. É a AUSÊNCIA do argumento que custa o dado.

     Lê o arquivo inteiro, comentários inclusive. Isso já pegou um comentário
     meu que continuou descrevendo a chamada sem guarda depois de ela ter sido
     corrigida — prosa desatualizada sobre este ponto também falha aqui, e é
     bom que falhe. */
  const arquivos = {
    "fluxograma (rota)": "src/routes/_app.quizzes_.$id.flow.tsx",
    "construtor (rota)": "src/routes/_app.quizzes_.$id.builder.tsx",
  };

  for (const [nome, caminho] of Object.entries(arquivos)) {
    it(`${nome}: nenhuma chamada de getSteps sem keepEmpty`, () => {
      const fonte = readFileSync(caminho, "utf8");
      const chamadas = fonte.match(/getSteps\([^)]*\)/g) ?? [];
      const semGuarda = chamadas.filter((c) => !c.includes("keepEmpty"));
      expect(semGuarda).toEqual([]);
    });
  }
});
