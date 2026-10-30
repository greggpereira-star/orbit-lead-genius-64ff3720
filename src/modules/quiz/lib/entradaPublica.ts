/** Limites para o que chega do navegador na rota pública de conclusão. */
export const LIMITES_ENTRADA = {
  corpoBytes: 20_000,
  nome: 100,
  variaveis: 40,
  chave: 40,
  valor: 200,
} as const;

export function limitarNome(nome: unknown): string {
  return typeof nome === "string" ? nome.trim().slice(0, LIMITES_ENTRADA.nome) : "";
}

/** Só texto, no máximo N pares, chave e valor curtos. O resto é descartado. */
export function limitarVariaveis(vars: unknown): Record<string, string> {
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) return {};
  const saida: Record<string, string> = Object.create(null);
  let n = 0;
  for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
    if (n >= LIMITES_ENTRADA.variaveis) break;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    if (k.length === 0 || k.length > LIMITES_ENTRADA.chave) continue;
    saida[k] = String(v).slice(0, LIMITES_ENTRADA.valor);
    n += 1;
  }
  return { ...saida };
}

/** UUID ou id curto de sessão. Recusa lixo e textos enormes. */
export function sessaoValida(s: unknown): s is string {
  return typeof s === "string" && /^[\w-]{8,64}$/.test(s);
}
