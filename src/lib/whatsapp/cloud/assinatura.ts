import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere o cabeçalho `X-Hub-Signature-256` de um webhook da Meta.
 *
 * Precisa do corpo CRU (string): reserializar o JSON muda a assinatura.
 * Comparação em tempo constante; sem cabeçalho, esquema errado ou segredo vazio
 * nunca confere.
 */
export function verificarAssinaturaMeta(
  corpoCru: string,
  cabecalho: string | null | undefined,
  segredoDoApp: string | null | undefined,
): boolean {
  if (!cabecalho || !segredoDoApp) return false;
  const [esquema, assinatura] = cabecalho.split("=");
  if (esquema !== "sha256" || !assinatura) return false;
  const esperada = createHmac("sha256", segredoDoApp).update(corpoCru, "utf8").digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(assinatura, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Segredos de app aceitos nos webhooks: o principal (`META_APP_SECRET`) e, opcionalmente, outros em
 * `META_APP_SECRET_EXTRA` (separados por vírgula). Serve para o mesmo endereço atender mais de um app da Meta
 * durante a migração (cada app assina com o próprio segredo). Vazio nunca conta.
 */
export function segredosDoApp(env: {
  META_APP_SECRET?: string | undefined;
  META_APP_SECRET_EXTRA?: string | undefined;
}): string[] {
  return [env.META_APP_SECRET, ...(env.META_APP_SECRET_EXTRA ?? "").split(",")]
    .map((segredo) => (segredo ?? "").trim())
    .filter((segredo) => segredo.length > 0);
}
