/**
 * `customData` que chega do navegador numa rota pública.
 *
 * Vai direto para o `custom_data` do evento na Meta, que aceita qualquer
 * chave — quem chamasse a rota poderia poluir o dataset do cliente com o que
 * quisesse. Só passa o que o pixel padrão de fato envia, com tipo e tamanho.
 */
const TEXTOS = ["content_name", "content_category", "content_type", "status"] as const;

export function sanitizarCustomData(bruto: unknown): Record<string, unknown> | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const e = bruto as Record<string, unknown>;
  const s: Record<string, unknown> = {};

  for (const chave of TEXTOS) {
    const v = e[chave];
    if (typeof v === "string" && v.length > 0) s[chave] = v.slice(0, 120);
  }
  if (typeof e.value === "number" && Number.isFinite(e.value) && e.value >= 0 && e.value < 1e9)
    s.value = e.value;
  if (typeof e.currency === "string" && /^[A-Za-z]{3}$/.test(e.currency))
    s.currency = e.currency.toUpperCase();
  if (typeof e.num_items === "number" && Number.isInteger(e.num_items) && e.num_items >= 0)
    s.num_items = Math.min(e.num_items, 1000);
  if (Array.isArray(e.content_ids)) {
    const ids = e.content_ids
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 20)
      .map((x) => x.slice(0, 80));
    if (ids.length) s.content_ids = ids;
  }
  return Object.keys(s).length ? s : null;
}
