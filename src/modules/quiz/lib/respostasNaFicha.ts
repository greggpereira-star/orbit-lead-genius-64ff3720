import { answerKind, type LeadAnswer } from "@/modules/crm/lib/leadFields";
import type { QuizSchema } from "../types";
import { perguntasDoSchema, tituloDaColuna, valorLegivel } from "./csvDeRespostas";

/**
 * Perguntas cuja resposta já é campo do lead (nome, e-mail, telefone). Repetir
 * na lista de respostas só faria a mesma informação aparecer duas vezes.
 */
const JA_E_CAMPO_DO_LEAD = new Set(["form", "email", "phone"]);

/**
 * "Pergunta → resposta" de um lead de quiz, no formato da ficha.
 *
 * O lead guarda `metadata.responses` como `{ "m-tecnica": "m-tecnica-dupla" }`:
 * id do bloco e id da opção. A ficha escondia esse mapa de propósito (virava
 * JSON com código no meio da tela) e por isso nenhuma resposta do quiz
 * aparecia. Aqui o texto sai do SCHEMA, pelas mesmas funções do CSV e da tela
 * de Respostas, na ordem em que o funil pergunta.
 */
export function respostasDoQuiz(
  schema: QuizSchema | null,
  responses: Record<string, unknown> | null | undefined,
): LeadAnswer[] {
  if (!schema || !responses) return [];
  const todas = perguntasDoSchema(schema);
  const saida: LeadAnswer[] = [];
  todas.forEach((bloco, i) => {
    if (JA_E_CAMPO_DO_LEAD.has(bloco.type)) return;
    const valor = valorLegivel(bloco, responses[bloco.id]);
    if (!valor) return;
    const pergunta = tituloDaColuna(bloco, i);
    saida.push({
      key: `quiz:${bloco.id}`,
      label: pergunta,
      short: pergunta.replace(/\s*\?+\s*$/, ""),
      value: valor,
      kind: answerKind(pergunta, valor),
    });
  });
  return saida;
}
