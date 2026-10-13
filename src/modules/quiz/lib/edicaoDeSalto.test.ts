import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { aplicarEdicaoDeSalto, type OrigemDoSalto } from "./edicaoDeSalto";
import { evaluateResponse, evaluateLogic } from "../engine";
import { resumirCondicao } from "./rotuloDaCondicao";
import type { QuizBlock, QuizSchema } from "../types";

/**
 * Editar o salto clicando na seta do fluxograma.
 *
 * O fluxograma era só leitura: desenhava as setas, e a edição acontecia no
 * inspetor, em outra tela, escolhendo o bloco de origem num seletor. A pergunta
 * "onde eu edito ISTO?" não tinha resposta onde ela nasce.
 *
 * O risco de abrir um segundo caminho de escrita é ele gravar diferente do
 * primeiro. Por isso a edição é uma função pura, testada contra o MOTOR: o que
 * o fluxograma grava é o que o player obedece.
 */
const schemaBase = (): QuizSchema =>
  ({
    blocks: [
      {
        id: "b1",
        type: "single-choice",
        title: "Qual sua dor?",
        options: [
          { id: "o1", label: "Rugas", jumpToBlockId: "b2" },
          { id: "o2", label: "Manchas" },
        ],
        logicRules: [
          { fieldBlockId: "b1", op: "eq", value: "o1", jumpToBlockId: "b2" },
          { fieldBlockId: "b1", op: "gt", value: 5, jumpToBlockId: "b3" },
        ],
      } as unknown as QuizBlock,
      { id: "b2", type: "heading" } as unknown as QuizBlock,
      { id: "b3", type: "heading" } as unknown as QuizBlock,
    ],
    steps: [
      { id: "s1", blockIds: ["b1"] },
      { id: "s2", blockIds: ["b2"] },
      { id: "s3", blockIds: ["b3"] },
    ],
  }) as unknown as QuizSchema;

const opcao: OrigemDoSalto = { tipo: "opcao", blockId: "b1", optionId: "o1" };
const regra0: OrigemDoSalto = { tipo: "regra", blockId: "b1", indice: 0 };

describe("o que o fluxograma grava é o que o motor obedece", () => {
  it("trocar o destino de uma opção muda para onde o visitante vai", () => {
    const antes = schemaBase();
    expect(evaluateResponse(antes.blocks[0], "o1").jumpToBlockId).toBe("b2");

    const depois = aplicarEdicaoDeSalto(antes, opcao, { jumpToBlockId: "b3" });
    expect(evaluateResponse(depois.blocks[0], "o1").jumpToBlockId).toBe("b3");
  });

  it("desfazer o salto da opção faz o visitante seguir o fluxo normal", () => {
    const depois = aplicarEdicaoDeSalto(schemaBase(), opcao, { jumpToBlockId: null });
    expect(evaluateResponse(depois.blocks[0], "o1").jumpToBlockId).toBeUndefined();
  });

  it("trocar operador e valor de uma regra muda quando ela dispara", () => {
    const antes = schemaBase();
    const ctx = (s: QuizSchema, resposta: unknown) => ({
      responses: { b1: resposta },
      blocks: s.blocks,
      score: 0,
      maxScore: 10,
    });

    // Antes: a primeira regra dispara com "o1"; a segunda, com número > 5.
    // (Escrevi aqui que "o2" dispararia a segunda. Não dispara: `Number("o2")`
    //  é NaN, e NaN > 5 é falso. Era erro meu, não do motor.)
    expect(evaluateLogic(antes.blocks[0], ctx(antes, "o1"))).toBe("b2");
    expect(evaluateLogic(antes.blocks[0], ctx(antes, 7))).toBe("b3");
    expect(evaluateLogic(antes.blocks[0], ctx(antes, "o2"))).toBeUndefined();

    const depois = aplicarEdicaoDeSalto(antes, regra0, { op: "eq", value: "o2" });
    expect(evaluateLogic(depois.blocks[0], ctx(depois, "o2"))).toBe("b2");
  });

  it("edita a regra do índice pedido, e só ela", () => {
    const depois = aplicarEdicaoDeSalto(schemaBase(), regra0, { jumpToBlockId: "b3" });
    const regras = depois.blocks[0].logicRules!;
    expect(regras[0].jumpToBlockId).toBe("b3");
    expect(regras[1]).toEqual(schemaBase().blocks[0].logicRules![1]);
  });

  it("não muda nada fora do bloco da origem", () => {
    const depois = aplicarEdicaoDeSalto(schemaBase(), opcao, { jumpToBlockId: "b3" });
    expect(depois.blocks.slice(1)).toEqual(schemaBase().blocks.slice(1));
    expect(depois.steps).toEqual(schemaBase().steps);
  });

  it("origem que não existe mais devolve o schema intacto, sem lançar", () => {
    // O fluxograma pode ter uma seta de um bloco que outra aba acabou de
    // apagar. Derrubar a tela seria pior do que não fazer nada.
    const base = schemaBase();
    for (const fantasma of [
      { tipo: "opcao", blockId: "sumiu", optionId: "o1" },
      { tipo: "opcao", blockId: "b1", optionId: "sumiu" },
      { tipo: "regra", blockId: "b1", indice: 9 },
    ] as OrigemDoSalto[]) {
      expect(aplicarEdicaoDeSalto(base, fantasma, { jumpToBlockId: "b3" })).toEqual(base);
    }
  });
});

describe("a seta diz qual condição é", () => {
  it("mostra operador e valor, não a palavra genérica", () => {
    // Era "condição" para TODA regra. Além de não dizer nada, a chave de
    // deduplicação inclui o rótulo: duas regras da mesma etapa para o mesmo
    // destino viravam uma seta só, e não havia como saber qual abrir.
    const [r1, r2] = schemaBase().blocks[0].logicRules!;
    expect(resumirCondicao(r1)).toBe("= o1");
    expect(resumirCondicao(r2)).toBe("> 5");
    expect(resumirCondicao(r1)).not.toBe(resumirCondicao(r2));
  });

  it("intervalo mostra os dois extremos", () => {
    expect(resumirCondicao({ op: "between", value: 1, value2: 9 } as never)).toBe("entre 1–9");
  });
});

describe("o fluxograma e a rota estão de fato ligados", () => {
  const flow = readFileSync("src/modules/quiz/components/QuizFlowView.tsx", "utf8");
  const rota = readFileSync("src/routes/_app.quizzes_.$id.flow.tsx", "utf8");

  it("clicar na seta abre a edição", () => {
    expect(flow).toContain("onEdgeClick");
    expect(flow).toContain("setSaltoEmEdicao");
  });

  it("a seta do fluxo normal não abre nada — não é condição", () => {
    expect(flow).toContain("if (origem) setSaltoEmEdicao(origem)");
  });

  it("a rota salva pela função pura, e não por conta própria", () => {
    expect(rota).toContain("aplicarEdicaoDeSalto");
    expect(rota).toContain("onEditarSalto={editarSalto}");
  });

  it("o rótulo do operador é um só para as duas telas", () => {
    const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");
    for (const [nome, fonte] of [
      ["inspetor", inspetor],
      ["fluxograma", flow],
    ] as const) {
      expect(fonte, `${nome} não usa o rótulo compartilhado`).toContain(
        'ROTULO_DO_OPERADOR } from "../lib/rotuloDaCondicao"',
      );
    }
  });
});
