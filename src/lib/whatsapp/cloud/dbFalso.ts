/** Banco e HTTP de mentira para os testes da camada WhatsApp. Só para teste. */
import { vi } from "vitest";
import type { DbWa } from "./processador";

export function criarDb(config: {
  tabelas?: Record<string, unknown>;
  rpc?: Record<string, { data?: unknown; error?: { message: string; code?: string } | null }>;
  /** Erro por tabela+operação, ex.: { "wa_credentials:upsert": { message: "x" } } */
  erros?: Record<string, { message: string }>;
}) {
  const ops: Array<{ tabela: string; op: string; args: unknown[] }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const builder = (tabela: string) => {
    let ultimaOp = "select";
    const b: Record<string, unknown> = {};
    const resposta = () => {
      const erro = config.erros?.[`${tabela}:${ultimaOp}`] ?? null;
      return { data: erro ? null : (config.tabelas?.[tabela] ?? null), error: erro };
    };
    for (const op of [
      "select",
      "eq",
      "in",
      "lt",
      "ilike",
      "order",
      "limit",
      "update",
      "upsert",
      "delete",
      "insert",
    ]) {
      b[op] = (...args: unknown[]) => {
        ops.push({ tabela, op, args });
        if (["update", "upsert", "delete", "insert"].includes(op)) ultimaOp = op;
        return b;
      };
    }
    b.maybeSingle = () => {
      const r = resposta();
      const d = r.data;
      return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: r.error });
    };
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta()).then(ok);
    return b;
  };

  const db: DbWa = {
    from: (tabela: string) => builder(tabela),
    rpc: (fn, args) => {
      rpcs.push({ fn, args });
      const r = config.rpc?.[fn] ?? { data: null, error: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { db, ops, rpcs };
}

/** `fetch` que responde por trecho da URL e registra as chamadas. */
export function rotearFetch(
  rotas: Record<
    string,
    { status?: number; corpo: unknown } | Array<{ status?: number; corpo: unknown }>
  >,
) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const contadores: Record<string, number> = {};
  const f = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    chamadas.push({ url: u, init });
    const chave = Object.keys(rotas).find((k) => u.includes(k));
    if (!chave)
      return new Response(
        JSON.stringify({ error: { message: `rota não simulada: ${u}`, code: 1 } }),
        { status: 404 },
      );
    const r = rotas[chave];
    const i = (contadores[chave] = (contadores[chave] ?? 0) + 1) - 1;
    const x = Array.isArray(r)
      ? (r[Math.min(i, r.length - 1)] as { status?: number; corpo: unknown })
      : r;
    return new Response(JSON.stringify(x.corpo), { status: x.status ?? 200 });
  });
  return { f, chamadas };
}
