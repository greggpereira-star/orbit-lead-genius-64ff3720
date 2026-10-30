import type { QuizBlock, QuizSchema } from "../types";
import { getSteps } from "./steps";

/**
 * Remove blocos do schema e limpa tudo que apontava para eles.
 *
 * Excluir sem limpar deixava o quiz quebrado em silêncio:
 *  - salto para bloco inexistente bloqueava a publicação (sem dizer qual);
 *  - `showIf` apontando para pergunta apagada escondia o bloco de TODO visitante
 *    (resposta ausente deixa `eq` falso) — sem erro em lugar nenhum.
 *
 * O salto de destino é gravado como o PRIMEIRO bloco da etapa. Se esse bloco é
 * apagado mas a etapa continua, o salto passa para o novo primeiro bloco dela;
 * só some quando a etapa inteira some.
 *
 * `showIf` cujo campo sumiu é REMOVIDO (o bloco volta a aparecer): esconder para
 * sempre é a pior falha possível, porque o lead nunca vê a pergunta.
 */
export function removerBlocosDoSchema(
  prev: QuizSchema,
  ids: Set<string>,
  opts: { removerEtapaId?: string } = {},
): QuizSchema {
  const etapas = getSteps(prev, { keepEmpty: true });

  // Para onde um salto que mirava um bloco removido deve passar a mirar.
  const redirecionar = new Map<string, string>();
  for (const s of etapas) {
    if (s.id === opts.removerEtapaId) continue;
    const primeiroRemovido = s.blockIds[0] && ids.has(s.blockIds[0]);
    if (!primeiroRemovido) continue;
    const novoPrimeiro = s.blockIds.find((b) => !ids.has(b));
    if (novoPrimeiro) redirecionar.set(s.blockIds[0], novoPrimeiro);
  }
  const alvoDoSalto = (id: string | undefined): string | undefined => {
    if (!id || !ids.has(id)) return id;
    return redirecionar.get(id); // undefined = salto some
  };

  const blocks = prev.blocks
    .filter((b) => !ids.has(b.id))
    .map((b): QuizBlock => {
      let novo: QuizBlock = b;
      const mudar = (patch: Partial<QuizBlock>) => {
        novo = { ...novo, ...patch };
      };

      if (b.childBlockIds?.some((c) => ids.has(c))) {
        mudar({ childBlockIds: b.childBlockIds.filter((c) => !ids.has(c)) });
      }
      if (b.options?.some((o) => o.jumpToBlockId && ids.has(o.jumpToBlockId))) {
        mudar({
          options: b.options.map((o) =>
            o.jumpToBlockId && ids.has(o.jumpToBlockId)
              ? { ...o, jumpToBlockId: alvoDoSalto(o.jumpToBlockId) }
              : o,
          ),
        });
      }
      if (b.logicRules?.some((r) => ids.has(r.jumpToBlockId) || ids.has((r as { fieldBlockId?: string }).fieldBlockId ?? ""))) {
        mudar({
          logicRules: b.logicRules
            .filter((r) => !ids.has((r as { fieldBlockId?: string }).fieldBlockId ?? ""))
            .map((r) => ({ ...r, jumpToBlockId: alvoDoSalto(r.jumpToBlockId) ?? "" }))
            .filter((r) => r.jumpToBlockId),
        });
      }
      if (b.showIf && ids.has(b.showIf.fieldBlockId)) {
        const { showIf: _descartado, ...resto } = novo;
        novo = resto as QuizBlock;
      }
      if (b.resumirBlocos?.some((r) => ids.has(r))) {
        mudar({ resumirBlocos: b.resumirBlocos.filter((r) => !ids.has(r)) });
      }
      return novo;
    });

  const steps = etapas
    .filter((s) => s.id !== opts.removerEtapaId)
    .map((s) => (s.blockIds.some((b) => ids.has(b)) ? { ...s, blockIds: s.blockIds.filter((b) => !ids.has(b)) } : s));

  return { ...prev, blocks, steps };
}
