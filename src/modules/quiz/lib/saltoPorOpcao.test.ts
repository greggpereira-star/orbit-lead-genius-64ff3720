import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { evaluateResponse, nextStepIndex, type QuizRunState } from "../engine";
import { getSteps } from "./steps";
import type { QuizBlock, QuizSchema } from "../types";

/**
 * Salto por opção, no formato EXATO que o construtor grava.
 *
 * Montado a partir de um quiz de teste criado na interface em 07/10: etapa 1
 * com uma escolha única cuja primeira opção manda "Pular para Etapa 3", e as
 * etapas 2, 3 e 4 com um título cada. Na tela, o visitante que escolhia essa
 * opção caía na etapa 2 — o salto não acontecia.
 */
const opcoes = [
  { id: "o1", label: "Aumentar vendas", jumpToBlockId: "h3" },
  { id: "o2", label: "Reduzir custos" },
  { id: "o3", label: "Escalar time" },
];

const schema = {
  blocks: [
    { id: "sc", type: "single-choice", options: opcoes },
    { id: "h2", type: "heading" },
    { id: "h3", type: "heading" },
    { id: "h4", type: "heading" },
  ] as QuizBlock[],
  steps: [
    { id: "s1", blockIds: ["sc"] },
    { id: "s2", blockIds: ["h2"] },
    { id: "s3", blockIds: ["h3"] },
    { id: "s4", blockIds: ["h4"] },
  ],
} as unknown as QuizSchema;

describe("salto por opção", () => {
  const steps = getSteps(schema);

  it("as quatro etapas são derivadas na ordem", () => {
    expect(steps.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("a opção escolhida carrega o salto", () => {
    expect(evaluateResponse(schema.blocks[0], "o1").jumpToBlockId).toBe("h3");
  });

  it("opção sem salto não inventa um", () => {
    expect(evaluateResponse(schema.blocks[0], "o2").jumpToBlockId).toBeUndefined();
  });

  it("o salto leva à etapa 3 (índice 2), não à etapa seguinte", () => {
    const state = {
      currentStepIndex: 0,
      responses: { sc: "o1" },
      score: 0,
      tags: [],
      history: [],
    } as QuizRunState;
    expect(nextStepIndex(steps, state, "h3")).toBe(2);
  });

  it("sem salto, segue para a etapa seguinte", () => {
    const state = {
      currentStepIndex: 0,
      responses: { sc: "o2" },
      score: 0,
      tags: [],
      history: [],
    } as QuizRunState;
    expect(nextStepIndex(steps, state, undefined)).toBe(1);
  });
});

/**
 * A numeração que o AUTOR lê precisa bater com a que o visitante percorre.
 *
 * Este é o caso que quebrou de verdade: as etapas foram criadas primeiro e os
 * componentes só depois, então a ordem de `steps` ficou diferente da ordem de
 * `blocks`. O seletor de salto derivava as etapas de `getSteps({ blocks })` —
 * sem `schema.steps` essa chamada trata cada bloco como uma etapa, na ordem de
 * `blocks` — e numerava por aí. O autor escolhia "Etapa 3" e o visitante caía
 * na Etapa 2. Nada no motor estava errado; o rótulo é que mentia.
 */
describe("ordem das etapas diferente da ordem dos blocos", () => {
  const fora = {
    blocks: [
      { id: "sc", type: "single-choice", options: [] },
      { id: "hA", type: "heading" },
      { id: "hB", type: "heading" },
      { id: "hC", type: "heading" },
    ] as QuizBlock[],
    steps: [
      { id: "s1", blockIds: ["sc"] },
      { id: "s2", blockIds: ["hB"] },
      { id: "s3", blockIds: ["hC"] },
      { id: "s4", blockIds: ["hA"] },
    ],
  } as unknown as QuizSchema;

  it("derivar das etapas reais e derivar só dos blocos dão ordens DIFERENTES", () => {
    const reais = getSteps(fora).map((s) => s.blockIds[0]);
    const soBlocos = getSteps({ blocks: fora.blocks }).map((s) => s.blockIds[0]);
    expect(reais).toEqual(["sc", "hB", "hC", "hA"]);
    expect(soBlocos).toEqual(["sc", "hA", "hB", "hC"]);
    expect(reais).not.toEqual(soBlocos);
  });

  it("a 3ª etapa real é hC — e era hB que o seletor antigo chamava de 'Etapa 3'", () => {
    expect(getSteps(fora)[2].blockIds[0]).toBe("hC");
    expect(getSteps({ blocks: fora.blocks })[2].blockIds[0]).toBe("hB");
  });

  it("o seletor lê as etapas de fora, não as deriva dos blocos", () => {
    const fonte = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");
    expect(fonte).not.toContain("getSteps({ blocks: allBlocks })");
    expect(fonte).toContain("steps: QuizStep[]");
  });
});
