import { timingSafeEqual } from "node:crypto";

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 *
 * `===` devolve no primeiro caractere diferente, e o tempo de resposta vaza
 * quantos caracteres do início estavam certos. Segredo vazio nunca confere —
 * "sem segredo configurado" não pode virar "qualquer um entra".
 */
export function segredoConfere(
  recebido: string | null | undefined,
  esperado: string | null | undefined,
): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
