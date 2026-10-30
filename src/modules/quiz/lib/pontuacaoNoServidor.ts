import { maxPossibleScore, minPossibleScore, recomputeScore } from "../engine";
import type { QuizSchema } from "../types";

/**
 * Pontuação que vale no servidor para escolher a faixa.
 *
 * A rota de conclusão é pública. Aceitar `score` do corpo deixava qualquer
 * chamador se declarar "Lead A" — e a faixa não só escolhe a mensagem como é
 * gravada no lead, que o comercial usa para priorizar. Com as respostas do lead
 * (gravadas pela captura) e o schema publicado, o servidor recalcula com a mesma
 * função do navegador. Sem respostas, aceita o valor do cliente mas preso ao
 * intervalo alcançável: nesse caso não há lead, logo nada é gravado nem enviado.
 */
export function pontuacaoNoServidor(
  schema: QuizSchema,
  respostas: Record<string, unknown> | null | undefined,
  scoreDoCliente: unknown,
): { score: number; max: number; min: number; recalculado: boolean } {
  const temRespostas = !!respostas && Object.keys(respostas).length > 0;
  const max = maxPossibleScore(schema, temRespostas ? respostas : undefined);
  const min = minPossibleScore(schema, temRespostas ? respostas : undefined);
  if (temRespostas) {
    return { score: recomputeScore(schema.blocks, respostas!).score, max, min, recalculado: true };
  }
  const bruto = typeof scoreDoCliente === "number" && Number.isFinite(scoreDoCliente) ? scoreDoCliente : 0;
  return { score: Math.min(max, Math.max(min, bruto)), max, min, recalculado: false };
}
