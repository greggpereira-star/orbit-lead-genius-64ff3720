import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  variaveisCitadas,
  variaveisDisponiveis,
  variaveisQueNaoResolvem,
  EMBUTIDAS,
} from "./variaveisDaMensagem";
import type { QuizBlock } from "../types";

const blocos = [
  { id: "a", type: "single-choice", outputVariable: "dor_principal" },
  { id: "b", type: "single-choice", outputVariable: "desejo" },
  { id: "c", type: "heading" },
] as unknown as QuizBlock[];

describe("variaveisCitadas", () => {
  it("acha as chaves e não repete", () => {
    expect(variaveisCitadas("Olá {{nome}}, sobre {{desejo}} e {{desejo}}")).toEqual([
      "nome",
      "desejo",
    ]);
  });

  it("aceita espaço dentro das chaves, como o interpolador do servidor", () => {
    expect(variaveisCitadas("{{ nome }}")).toEqual(["nome"]);
  });

  it("template sem variável devolve lista vazia", () => {
    expect(variaveisCitadas("Olá, tudo bem?")).toEqual([]);
  });
});

describe("variaveisDisponiveis", () => {
  it("junta as embutidas com as de saída do quiz", () => {
    expect(variaveisDisponiveis(blocos)).toEqual([...EMBUTIDAS, "dor_principal", "desejo"]);
  });

  it("bloco sem variável de saída não entra", () => {
    expect(variaveisDisponiveis([{ id: "x", type: "heading" }] as unknown as QuizBlock[])).toEqual([
      ...EMBUTIDAS,
    ]);
  });
});

describe("variaveisQueNaoResolvem", () => {
  it("template correto não acusa nada", () => {
    expect(
      variaveisQueNaoResolvem("Olá {{nome}}, {{dor_principal}} — faixa {{faixa}}", blocos),
    ).toEqual([]);
  });

  it("pega o nome errado — é ele que vira buraco na mensagem", () => {
    expect(variaveisQueNaoResolvem("Sobre {{dor_pricipal}}", blocos)).toEqual(["dor_pricipal"]);
  });

  it("pega a variável que existia e foi removida do quiz", () => {
    expect(variaveisQueNaoResolvem("Seu medo é {{medo}}", blocos)).toEqual(["medo"]);
  });
});

/**
 * As embutidas daqui têm de bater com as que o servidor monta.
 *
 * Se `quiz-completed.ts` passar a resolver mais uma e esta lista não souber, a
 * validação acusaria erro onde não há — e o autor aprenderia a ignorá-la.
 */
describe("paridade com o servidor", () => {
  it("as embutidas aparecem no escopo montado em quiz-completed", () => {
    const rota = readFileSync("src/routes/api/public/quiz-completed.ts", "utf8");
    const escopo = rota.slice(
      rota.indexOf("interpolar(faixa.whatsappTemplate"),
      rota.indexOf("interpolar(faixa.whatsappTemplate") + 300,
    );
    for (const v of EMBUTIDAS) {
      expect(escopo, v).toContain(`${v}:`);
    }
  });

  it("e o servidor também espalha as variáveis de saída", () => {
    const rota = readFileSync("src/routes/api/public/quiz-completed.ts", "utf8");
    expect(rota).toContain("...(body.variaveis ?? {})");
  });
});
