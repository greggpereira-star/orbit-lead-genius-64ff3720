import type { BlockLogicOp, QuizBlock, QuizSchema, QuizStep } from "../types";
import { BLOCOS_QUE_PERGUNTAM } from "./resumoDasRespostas";

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

/** Um salto a criar, arrastando de uma etapa para outra no fluxograma. */
export type SaltoNovo =
  | { tipo: "opcao"; blockId: string; optionId: string; jumpToBlockId: string }
  | {
      tipo: "regra";
      blockId: string;
      op: BlockLogicOp;
      value: string | number;
      jumpToBlockId: string;
    };

/**
 * Blocos de uma etapa que podem originar um salto.
 *
 * Salto depende de resposta, então só quem pergunta serve de origem — a mesma
 * lista que monta o resumo, importada e não recopiada.
 *
 * Para o salto por OPÇÃO ainda é preciso ter opções: um campo de texto aceita
 * regra ("se contém X"), mas não tem opção onde pendurar um destino.
 */
export function origensPossiveis(schema: QuizSchema, step: QuizStep): QuizBlock[] {
  return step.blockIds
    .map((id) => schema.blocks.find((b) => b.id === id))
    .filter((b): b is QuizBlock => !!b && BLOCOS_QUE_PERGUNTAM.has(b.type));
}

/**
 * Cria um salto, devolvendo um schema novo.
 *
 * Grava nos MESMOS campos que o inspetor escreve. Um segundo caminho de escrita
 * só se justifica se produzir o mesmo resultado que o primeiro — os testes
 * conferem isso contra o motor, não contra o formato.
 *
 * Destino igual à própria etapa de origem é recusado: é o laço que o validador
 * de publicação já bloqueia, e deixar criar aqui seria oferecer o erro.
 */
export function adicionarSalto(schema: QuizSchema, novo: SaltoNovo): QuizSchema {
  const bloco = schema.blocks.find((b) => b.id === novo.blockId);
  if (!bloco) return schema;

  const etapaDaOrigem = schema.steps?.find((st) => st.blockIds.includes(novo.blockId));
  if (etapaDaOrigem?.blockIds.includes(novo.jumpToBlockId)) return schema;

  const blocks = schema.blocks.map((b) => {
    if (b.id !== novo.blockId) return b;

    if (novo.tipo === "opcao") {
      const opcoes = b.options ?? [];
      if (!opcoes.some((o) => o.id === novo.optionId)) return b;
      return {
        ...b,
        options: opcoes.map((o) =>
          o.id === novo.optionId ? { ...o, jumpToBlockId: novo.jumpToBlockId } : o,
        ),
      };
    }

    return {
      ...b,
      logicRules: [
        ...(b.logicRules ?? []),
        {
          fieldBlockId: novo.blockId,
          op: novo.op,
          value: novo.value,
          jumpToBlockId: novo.jumpToBlockId,
        },
      ],
    };
  });

  return { ...schema, blocks };
}
