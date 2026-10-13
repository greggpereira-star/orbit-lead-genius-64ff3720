import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isBlockVisible, evaluateLogic } from "../engine";
import type { BlockLogicOp, QuizBlock, ShowIfOp } from "../types";

/**
 * "Mostrar se" e "regra de salto" fazem a MESMA pergunta — a resposta do bloco
 * X satisfaz esta condição? — por dois caminhos independentes:
 *
 * - `isBlockVisible` traz a comparação escrita dentro dela;
 * - `evaluateLogic` chama `compara`, uma função à parte.
 *
 * Duas implementações da mesma regra. O próprio `types.ts` registra que elas já
 * divergiram: "Eram só cinco aqui, sem motivo técnico" — por um tempo a
 * condicional aceitava operadores que o salto não aceitava, e o autor não tinha
 * como saber qual dos dois lugares entendia o quê.
 *
 * Isto compara as duas EXECUTANDO, não lendo. Operador novo em uma só, ou
 * mudança de semântica em uma só, reprova aqui.
 */
const OPERADORES: BlockLogicOp[] = ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "between"];

/** Pelo "mostrar se": o bloco aparece quando a condição bate. */
const peloMostrarSe = (op: ShowIfOp, resposta: unknown, alvo: string | number) =>
  isBlockVisible(
    {
      id: "alvo",
      type: "heading",
      showIf: { enabled: true, fieldBlockId: "fonte", op, value: alvo },
    } as unknown as QuizBlock,
    { fonte: resposta },
  );

/** Pela regra de salto: há salto quando a condição bate. */
const peloSalto = (op: BlockLogicOp, resposta: unknown, alvo: string | number) =>
  evaluateLogic(
    {
      id: "fonte",
      type: "single-choice",
      logicRules: [{ fieldBlockId: "fonte", op, value: alvo, jumpToBlockId: "destino" }],
    } as unknown as QuizBlock,
    { responses: { fonte: resposta }, blocks: [], score: 0, maxScore: 10 },
  ) === "destino";

describe("as duas condicionais respondem igual", () => {
  const casos: { resposta: unknown; alvo: string | number }[] = [
    { resposta: "sim", alvo: "sim" },
    { resposta: "sim", alvo: "nao" },
    { resposta: "", alvo: "" },
    { resposta: undefined, alvo: "x" },
    { resposta: 5, alvo: 5 },
    { resposta: 5, alvo: 3 },
    { resposta: 3, alvo: 5 },
    { resposta: "ANSIEDADE", alvo: "ansie" },
    { resposta: ["a", "b"], alvo: "b" },
    { resposta: ["a", "b"], alvo: "c" },
    { resposta: "7", alvo: 7 },
  ];

  for (const op of OPERADORES) {
    it(`${op}: mesma resposta nos dois caminhos`, () => {
      for (const { resposta, alvo } of casos) {
        expect(
          peloMostrarSe(op, resposta, alvo),
          `op=${op} resposta=${JSON.stringify(resposta)} alvo=${JSON.stringify(alvo)}`,
        ).toBe(peloSalto(op, resposta, alvo));
      }
    });
  }
});

describe("as duas listas de operador não podem divergir", () => {
  const tipos = readFileSync("src/modules/quiz/types.ts", "utf8");

  const uniao = (nome: string): string[] => {
    const m = tipos.match(new RegExp(`export type ${nome} =([^;]+);`));
    if (!m) throw new Error(`não achei a união ${nome}`);
    return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]).sort();
  };

  it("ShowIfOp e BlockLogicOp declaram os mesmos operadores", () => {
    // São duas uniões separadas no mesmo arquivo. Enquanto forem duas, isto é
    // o que impede uma de crescer sozinha de novo.
    expect(uniao("ShowIfOp")).toEqual(uniao("BlockLogicOp"));
  });

  it("este teste cobre todos eles", () => {
    // Guarda contra si mesmo: operador novo que ninguém acrescentar à lista
    // acima passaria despercebido pelo teste de concordância.
    expect([...OPERADORES].sort()).toEqual(uniao("BlockLogicOp"));
  });
});
