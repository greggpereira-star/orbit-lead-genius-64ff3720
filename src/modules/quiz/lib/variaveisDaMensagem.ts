import type { QuizBlock } from "../types";

/**
 * Variáveis que o servidor resolve sozinho ao montar a mensagem.
 *
 * Vêm de `quiz-completed.ts`, que monta o escopo com `nome`, `faixa` e as
 * variáveis de saída do quiz. Esta lista precisa acompanhar aquela: uma
 * embutida a mais lá e a menos aqui faria a validação acusar erro onde não há.
 */
export const EMBUTIDAS = ["nome", "faixa"] as const;

/** `{{dor_principal}}` → `dor_principal`. Aceita espaço dentro das chaves. */
export function variaveisCitadas(template: string): string[] {
  const achadas = template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g);
  return [...new Set([...achadas].map((m) => m[1]))];
}

/** Nomes que o autor deu às respostas, em `Variável de saída`. */
export function variaveisDisponiveis(blocos: QuizBlock[]): string[] {
  const nomes = blocos.map((b) => b.outputVariable?.trim()).filter((n): n is string => !!n);
  return [...new Set([...EMBUTIDAS, ...nomes])];
}

/**
 * Variáveis citadas num template que ninguém resolve.
 *
 * O interpolador troca chave sem valor por STRING VAZIA — nunca deixa
 * `{{dor_principal}}` cru na mensagem. A intenção é boa (o lead não recebe
 * código), mas o efeito é que um nome errado não aparece em lugar nenhum: a
 * mensagem sai com um buraco no meio da frase, e nem o autor nem o lead têm
 * como saber que faltou coisa. Daí a checagem ser antes de publicar.
 */
export function variaveisQueNaoResolvem(template: string, blocos: QuizBlock[]): string[] {
  const existem = new Set(variaveisDisponiveis(blocos));
  return variaveisCitadas(template).filter((v) => !existem.has(v));
}
