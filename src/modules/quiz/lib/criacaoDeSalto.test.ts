import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { adicionarSalto, origensPossiveis, type SaltoNovo } from "./edicaoDeSalto";
import { evaluateResponse, evaluateLogic } from "../engine";
import type { QuizBlock, QuizSchema } from "../types";

/**
 * Criar salto arrastando de uma etapa para outra.
 *
 * O arrasto entrega duas pontas e mais nada: de qual etapa, para qual. Falta de
 * QUAL bloco e sob QUE condição — e o fluxograma não tem como adivinhar, porque
 * uma etapa pode ter mais de uma pergunta e um salto nasce de uma opção ou de
 * uma regra. Por isso o arrasto abre uma tela em vez de criar algo no escuro.
 *
 * O risco deste segundo caminho de escrita é gravar diferente do inspetor. Os
 * testes conferem contra o MOTOR: o que o arrasto cria é o que o player obedece.
 */
const schema = (): QuizSchema =>
  ({
    blocks: [
      {
        id: "b1",
        type: "single-choice",
        title: "Qual sua dor?",
        options: [
          { id: "o1", label: "Rugas" },
          { id: "o2", label: "Manchas" },
        ],
      } as unknown as QuizBlock,
      { id: "b2", type: "short-text", title: "Seu nome" } as unknown as QuizBlock,
      { id: "b3", type: "heading", title: "Resultado" } as unknown as QuizBlock,
      { id: "b4", type: "paragraph" } as unknown as QuizBlock,
    ],
    steps: [
      { id: "s1", blockIds: ["b1", "b2"] },
      { id: "s2", blockIds: ["b3"] },
      { id: "s3", blockIds: ["b4"] },
    ],
  }) as unknown as QuizSchema;

const ctx = (s: QuizSchema, resposta: unknown, id = "b1") => ({
  responses: { [id]: resposta },
  blocks: s.blocks,
  score: 0,
  maxScore: 10,
});

describe("quem pode originar um salto", () => {
  it("só os blocos que perguntam", () => {
    const s = schema();
    expect(origensPossiveis(s, s.steps![0]).map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("etapa só com conteúdo não origina nada", () => {
    const s = schema();
    expect(origensPossiveis(s, s.steps![1])).toEqual([]);
  });
});

describe("o que o arrasto cria é o que o motor obedece", () => {
  it("salto por opção: escolher aquela opção leva ao destino", () => {
    const antes = schema();
    expect(evaluateResponse(antes.blocks[0], "o2").jumpToBlockId).toBeUndefined();

    const depois = adicionarSalto(antes, {
      tipo: "opcao",
      blockId: "b1",
      optionId: "o2",
      jumpToBlockId: "b3",
    });
    expect(evaluateResponse(depois.blocks[0], "o2").jumpToBlockId).toBe("b3");
    // A outra opção não foi tocada.
    expect(evaluateResponse(depois.blocks[0], "o1").jumpToBlockId).toBeUndefined();
  });

  it("salto por regra: a condição criada dispara de verdade", () => {
    const depois = adicionarSalto(schema(), {
      tipo: "regra",
      blockId: "b2",
      op: "contains",
      value: "maria",
      jumpToBlockId: "b3",
    });
    const bloco = depois.blocks.find((b) => b.id === "b2")!;
    expect(evaluateLogic(bloco, ctx(depois, "Maria Silva", "b2"))).toBe("b3");
    expect(evaluateLogic(bloco, ctx(depois, "João", "b2"))).toBeUndefined();
  });

  it("a regra nova entra ao lado das que já existiam, sem apagar nenhuma", () => {
    const comUma = adicionarSalto(schema(), {
      tipo: "regra",
      blockId: "b1",
      op: "eq",
      value: "o1",
      jumpToBlockId: "b3",
    });
    const comDuas = adicionarSalto(comUma, {
      tipo: "regra",
      blockId: "b1",
      op: "eq",
      value: "o2",
      jumpToBlockId: "b4",
    });
    const regras = comDuas.blocks[0].logicRules!;
    expect(regras).toHaveLength(2);
    expect(evaluateLogic(comDuas.blocks[0], ctx(comDuas, "o1"))).toBe("b3");
    expect(evaluateLogic(comDuas.blocks[0], ctx(comDuas, "o2"))).toBe("b4");
  });
});

describe("o que o núcleo recusa", () => {
  it("saltar para a própria etapa de origem", () => {
    // É o laço que o validador de publicação já bloqueia. Deixar criar aqui
    // seria oferecer o erro para depois acusá-lo.
    const s = schema();
    expect(
      adicionarSalto(s, { tipo: "opcao", blockId: "b1", optionId: "o1", jumpToBlockId: "b2" }),
    ).toEqual(s);
  });

  it("bloco ou opção que não existe devolve o schema intacto", () => {
    const s = schema();
    for (const novo of [
      { tipo: "opcao", blockId: "sumiu", optionId: "o1", jumpToBlockId: "b3" },
      { tipo: "opcao", blockId: "b1", optionId: "sumiu", jumpToBlockId: "b3" },
    ] as SaltoNovo[]) {
      expect(adicionarSalto(s, novo)).toEqual(s);
    }
  });

  it("não mexe em bloco nenhum fora da origem", () => {
    const depois = adicionarSalto(schema(), {
      tipo: "opcao",
      blockId: "b1",
      optionId: "o1",
      jumpToBlockId: "b3",
    });
    expect(depois.blocks.slice(1)).toEqual(schema().blocks.slice(1));
  });
});

describe("o arrasto está ligado, e só pela alça certa", () => {
  const flow = readFileSync("src/modules/quiz/components/QuizFlowView.tsx", "utf8");
  const rota = readFileSync("src/routes/_app.quizzes_.$id.flow.tsx", "utf8");

  it("arrastar abre a tela de criação", () => {
    expect(flow).toContain("onConnect");
    expect(flow).toContain("DialogoDeSaltoNovo");
  });

  it("só a alça de ramificação cria salto", () => {
    expect(flow).toContain('ligacao.sourceHandle !== "branch-source"');
  });

  it("as alças do fluxo sequencial não aceitam ligação", () => {
    // Arrastar delas e nada acontecer seria pior do que não poder arrastar.
    expect((flow.match(/isConnectable=\{false\}/g) ?? []).length).toBe(2);
  });

  it("a rota grava pelo núcleo puro", () => {
    expect(rota).toContain("adicionarSalto");
    expect(rota).toContain("onCriarSalto={criarSalto}");
  });
});
