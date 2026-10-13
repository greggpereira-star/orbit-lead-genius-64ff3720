import type { BlockLogicOp, QuizSchema } from "../types";

/**
 * De onde uma seta do fluxograma saiu.
 *
 * Um salto nasce em dois lugares diferentes do schema: na OPÇÃO de uma escolha
 * (`options[].jumpToBlockId`) ou numa REGRA do bloco (`logicRules[]`). A seta
 * desenhada é igual nos dois casos, então sem isto o clique não teria como
 * saber o que abrir.
 */
export type OrigemDoSalto =
  | { tipo: "opcao"; blockId: string; optionId: string }
  | { tipo: "regra"; blockId: string; indice: number };

export interface MudancaDoSalto {
  /** Id do bloco de destino. `null` desfaz o salto; `undefined` não mexe. */
  jumpToBlockId?: string | null;
  op?: BlockLogicOp;
  value?: string | number;
  value2?: number;
}

/**
 * Aplica a edição de UM salto, devolvendo um schema novo.
 *
 * Função pura e fora da tela de propósito: é o que permite provar que editar
 * pelo fluxograma produz exatamente o mesmo schema que editar pelo inspetor.
 * Duas telas escrevendo o mesmo campo por caminhos diferentes é como nascem as
 * divergências que esta auditoria vem desfazendo.
 *
 * Origem que não existe mais devolve o schema INTACTO, sem lançar: o
 * fluxograma pode estar com uma seta de um bloco que outra aba acabou de
 * apagar, e derrubar a tela seria pior do que não fazer nada.
 */
export function aplicarEdicaoDeSalto(
  schema: QuizSchema,
  origem: OrigemDoSalto,
  mudanca: MudancaDoSalto,
): QuizSchema {
  const blocos = schema.blocks.map((b) => {
    if (b.id !== origem.blockId) return b;

    if (origem.tipo === "opcao") {
      const options = (b.options ?? []).map((o) =>
        o.id === origem.optionId
          ? {
              ...o,
              jumpToBlockId:
                mudanca.jumpToBlockId === null
                  ? undefined
                  : (mudanca.jumpToBlockId ?? o.jumpToBlockId),
            }
          : o,
      );
      return { ...b, options };
    }

    const regras = b.logicRules ?? [];
    if (origem.indice < 0 || origem.indice >= regras.length) return b;
    const logicRules = regras.map((r, i) =>
      i === origem.indice
        ? {
            ...r,
            /* `jumpToBlockId` de uma regra é obrigatório: regra sem destino não
               é regra. Desfazer aqui significa remover a regra, que é a etapa 3
               deste trabalho — por ora o nulo é ignorado. */
            jumpToBlockId: mudanca.jumpToBlockId ?? r.jumpToBlockId,
            op: mudanca.op ?? r.op,
            value: mudanca.value ?? r.value,
            value2: mudanca.value2 ?? r.value2,
          }
        : r,
    );
    return { ...b, logicRules };
  });

  return { ...schema, blocks: blocos };
}
