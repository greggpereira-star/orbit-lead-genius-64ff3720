import type { BlockLogicOp, BlockLogicRule } from "../types";

/**
 * Como cada operador é lido por gente.
 *
 * Vive aqui porque o inspetor e o fluxograma precisam do MESMO texto: o autor
 * escreve a condição num lugar e a reconhece no outro. Dois mapas dariam
 * "é maior que" numa tela e "maior" na outra para a mesma regra.
 *
 * `Record<BlockLogicOp, string>` de propósito: operador novo na união sem
 * rótulo aqui não compila.
 */
export const ROTULO_DO_OPERADOR: Record<BlockLogicOp, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  contains: "contém",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  between: "está entre",
};

/** Versão curta, para caber na seta do fluxograma. */
export const SIMBOLO_DO_OPERADOR: Record<BlockLogicOp, string> = {
  eq: "=",
  neq: "≠",
  contains: "∋",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "entre",
};

/**
 * A condição de uma regra, curta o bastante para rotular uma seta.
 *
 * Toda regra virava a palavra "condição" no fluxograma. Além de não dizer
 * nada, isso fazia duas regras da mesma etapa para o mesmo destino colapsarem
 * numa seta só — e não havia como saber qual delas se estava olhando.
 */
export function resumirCondicao(regra: BlockLogicRule): string {
  const simbolo = SIMBOLO_DO_OPERADOR[regra.op] ?? "?";
  const alvo =
    regra.op === "between"
      ? `${regra.value}–${regra.value2 ?? regra.value}`
      : String(regra.value ?? "");
  const modo = regra.kind && regra.kind !== "resposta" ? `${regra.kind} ` : "";
  return `${modo}${simbolo} ${alvo}`.trim();
}
