import { describe, expect, it } from "vitest";
import { processarEvento, type DbWa } from "./processador";
import type { EventoWa } from "./payload";

/** Banco de mentira: registra as operações; `rpc` devolve a ingestão da mensagem como nova. */
function criarDb() {
  const ops: Array<{ tabela: string; op: string; args: unknown[] }> = [];
  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const op of [
      "select",
      "eq",
      "in",
      "is",
      "gte",
      "lt",
      "or",
      "order",
      "limit",
      "update",
      "upsert",
    ]) {
      b[op] = (...args: unknown[]) => (ops.push({ tabela, op, args }), b);
    }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return b;
  };
  const db: DbWa = {
    from: (t: string) => builder(t),
    rpc: () =>
      Promise.resolve({
        data: [{ out_conversa: "c1", out_mensagem: "m1", out_empresa: "emp", inserida: true }],
        error: null,
      }),
  } as DbWa;
  return { db, ops };
}

const mensagem = (body: string): EventoWa =>
  ({
    kind: "message",
    dedupKey: "msg:w1",
    phoneNumberId: "PNID",
    waId: "5527996318075",
    profileName: "Ana",
    wamid: "w1",
    type: "text",
    body,
    payload: { id: "w1" },
    ts: "2026-10-24T10:00:00.000Z",
    referral: null,
    replyToWamid: null,
  }) as EventoWa;

const gravouNota = (ops: ReturnType<typeof criarDb>["ops"]) =>
  ops.find(
    (o) =>
      o.tabela === "wa_conversations" &&
      o.op === "update" &&
      "csat_score" in (o.args[0] as Record<string, unknown>),
  );

describe("avaliação do atendimento no processador de mensagens", () => {
  it("'5' grava a nota na conversa, só se a pesquisa estiver em aberto e no prazo", async () => {
    const { db, ops } = criarDb();
    await processarEvento(db, mensagem("5"));
    const up = gravouNota(ops);
    expect(up).toBeTruthy();
    expect(up!.args[0]).toMatchObject({ csat_score: 5 });
    // O filtro mora no UPDATE: id e empresa da conversa, sem nota anterior, pedido dentro de 48 h.
    const depois = ops.filter((o) => o.tabela === "wa_conversations");
    expect(depois.some((o) => o.op === "eq" && o.args[0] === "id" && o.args[1] === "c1")).toBe(
      true,
    );
    expect(
      depois.some((o) => o.op === "eq" && o.args[0] === "company_id" && o.args[1] === "emp"),
    ).toBe(true);
    expect(
      depois.some((o) => o.op === "is" && o.args[0] === "csat_score" && o.args[1] === null),
    ).toBe(true);
    expect(depois.some((o) => o.op === "gte" && o.args[0] === "csat_requested_at")).toBe(true);
  });

  it("texto que não é nota não toca na avaliação", async () => {
    for (const t of ["olá", "5 minutos", "10", "0"]) {
      const { db, ops } = criarDb();
      await processarEvento(db, mensagem(t));
      expect(gravouNota(ops), t).toBeUndefined();
    }
  });
});
