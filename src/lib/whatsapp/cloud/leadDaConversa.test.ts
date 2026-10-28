import { describe, expect, it } from "vitest";
import {
  ORIGEM_ANUNCIO,
  ORIGEM_ATENDIMENTO,
  criarLeadDaConversa,
  origemDaConversa,
  vincularConversaAoLead,
} from "./leadDaConversa";
import type { DbWa } from "./processador";

/** Banco falso mínimo: o que cada tabela devolve em `select` e em `insert`. */
function criarBanco(tabelas: Record<string, { select?: unknown; insert?: unknown }>) {
  const ops: Array<{ tabela: string; op: string; args: unknown[] }> = [];
  const builder = (tabela: string) => {
    let modo: "select" | "insert" = "select";
    const b: Record<string, unknown> = {};
    const resposta = () => ({
      data: (modo === "insert" ? tabelas[tabela]?.insert : tabelas[tabela]?.select) ?? null,
      error: null,
    });
    for (const op of ["select", "eq", "or", "limit", "order", "in", "ilike", "update", "insert"]) {
      b[op] = (...args: unknown[]) => {
        ops.push({ tabela, op, args });
        if (op === "insert") modo = "insert";
        return b;
      };
    }
    b.maybeSingle = () => {
      const d = resposta().data;
      return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: null });
    };
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta()).then(ok);
    return b;
  };
  const db = {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: unknown) => {
      ops.push({ tabela: "rpc", op: fn, args: [args] });
      return Promise.resolve({ data: "etapa-entrada", error: null });
    },
  } as unknown as DbWa;
  return { db, ops };
}

const conversa = (o: Record<string, unknown> = {}) => ({
  id: "conv1",
  company_id: "emp",
  contact_id: "ct1",
  lead_id: null,
  origin: null,
  ...o,
});
const contato = { id: "ct1", wa_id: "5527992634480", profile_name: "Gregg Palmer", lead_id: null };
const base = { companyId: "emp", userId: "u1", conversaId: "conv1" };

describe("origemDaConversa", () => {
  it("sem referral: WhatsApp", () => {
    expect(origemDaConversa(null)).toEqual({ source: ORIGEM_ATENDIMENTO, anuncio: null });
    expect(origemDaConversa({})).toEqual({ source: ORIGEM_ATENDIMENTO, anuncio: null });
  });
  it("com referral de anúncio: 'Anúncio no WhatsApp' e guarda o anúncio", () => {
    const r = origemDaConversa({
      source_id: "AD1",
      source_type: "ad",
      headline: "Oferta",
      ctwa_clid: "CLK",
      lixo: 1,
    });
    expect(r.source).toBe(ORIGEM_ANUNCIO);
    expect(r.anuncio).toEqual({
      source_id: "AD1",
      source_type: "ad",
      headline: "Oferta",
      ctwa_clid: "CLK",
    });
  });
});

describe("criarLeadDaConversa", () => {
  it("cria o lead, registra o evento e liga conversa e contato", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    const r = await criarLeadDaConversa(db, base);
    expect(r).toEqual({ ok: true, leadId: "lead1", jaLigado: false });

    const ins = ops.find((o) => o.tabela === "leads" && o.op === "insert")!.args[0] as Record<
      string,
      unknown
    >;
    expect(ins).toMatchObject({
      company_id: "emp",
      name: "Gregg Palmer",
      phone: "+55 (27) 99263-4480",
      source: "WhatsApp",
      status: "new",
      stage_id: "etapa-entrada",
      score: 0,
    });
    expect(ins.metadata).toMatchObject({
      created_from: "whatsapp_inbox",
      conversation_id: "conv1",
    });
    expect(ops.some((o) => o.tabela === "lead_events" && o.op === "insert")).toBe(true);
    const ligados = ops.filter((o) => o.op === "update").map((o) => `${o.tabela}`);
    expect(ligados).toEqual(expect.arrayContaining(["wa_contacts", "wa_conversations"]));
  });

  it("conversa de anúncio nasce com origem 'Anúncio no WhatsApp' e guarda o anúncio", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa({ origin: { source_id: "AD9", headline: "Promo" } }) },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    await criarLeadDaConversa(db, base);
    const ins = ops.find((o) => o.tabela === "leads" && o.op === "insert")!.args[0] as Record<
      string,
      unknown
    >;
    expect(ins.source).toBe("Anúncio no WhatsApp");
    expect(ins.metadata).toMatchObject({ whatsapp_ad: { source_id: "AD9", headline: "Promo" } });
  });

  it("nome digitado vence o do perfil", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    await criarLeadDaConversa(db, { ...base, nome: "Ana Souza" });
    const ins = ops.find((o) => o.tabela === "leads" && o.op === "insert")!.args[0] as Record<
      string,
      unknown
    >;
    expect(ins.name).toBe("Ana Souza");
  });

  it("conversa de OUTRA empresa: não acha e não cria nada", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa({ company_id: "outra" }) },
      wa_contacts: { select: contato },
    });
    expect(await criarLeadDaConversa(db, base)).toEqual({
      ok: false,
      texto: "Conversa não encontrada.",
    });
    expect(ops.some((o) => o.op === "insert")).toBe(false);
  });

  it("já ligada: idempotente, não cria outro lead", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa({ lead_id: "leadX" }) },
      wa_contacts: { select: contato },
    });
    expect(await criarLeadDaConversa(db, base)).toEqual({
      ok: true,
      leadId: "leadX",
      jaLigado: true,
    });
    expect(ops.some((o) => o.tabela === "leads" && o.op === "insert")).toBe(false);
  });

  it("telefone que já é de um lead: devolve o duplicado e NÃO cria", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: {
        select: [
          {
            id: "leadA",
            name: "Ana Souza",
            email: null,
            phone: "(27) 99263-4480",
            created_at: "2026-10-12T10:00:00Z",
            stage: { name: "Qualificado" },
          },
        ],
      },
    });
    const r = await criarLeadDaConversa(db, base);
    expect(r).toMatchObject({
      ok: false,
      duplicado: { id: "leadA", name: "Ana Souza", stage: "Qualificado" },
    });
    expect(ops.some((o) => o.tabela === "leads" && o.op === "insert")).toBe(false);
  });

  it("e-mail inválido é recusado antes de qualquer gravação", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: [] },
    });
    const r = await criarLeadDaConversa(db, { ...base, email: "abc" });
    expect(r).toMatchObject({ ok: false });
    expect("texto" in r).toBe(true);
    expect(ops.some((o) => o.op === "insert")).toBe(false);
  });
});

describe("vincularConversaAoLead", () => {
  const lead = (o: Record<string, unknown> = {}) => ({
    id: "leadA",
    company_id: "emp",
    phone: "(27) 99263-4480",
    ...o,
  });

  it("liga quando o telefone do lead é o da conversa", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: lead() },
    });
    expect(await vincularConversaAoLead(db, { ...base, leadId: "leadA" })).toEqual({
      ok: true,
      leadId: "leadA",
    });
    expect(ops.filter((o) => o.op === "update").length).toBe(2);
    expect(ops.some((o) => o.tabela === "lead_events" && o.op === "insert")).toBe(true);
  });

  it("recusa lead com OUTRO telefone: ninguém liga a conversa a um lead qualquer", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: lead({ phone: "(11) 91111-2222" }) },
    });
    const r = await vincularConversaAoLead(db, { ...base, leadId: "leadA" });
    expect(r).toMatchObject({ ok: false });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("recusa lead de outra empresa", async () => {
    const { db } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: lead({ company_id: "outra" }) },
    });
    expect(await vincularConversaAoLead(db, { ...base, leadId: "leadA" })).toEqual({
      ok: false,
      texto: "Lead não encontrado.",
    });
  });

  it("recusa conversa já ligada a outro lead", async () => {
    const { db } = criarBanco({
      wa_conversations: { select: conversa({ lead_id: "leadZ" }) },
      wa_contacts: { select: contato },
      leads: { select: lead() },
    });
    expect(await vincularConversaAoLead(db, { ...base, leadId: "leadA" })).toEqual({
      ok: false,
      texto: "Esta conversa já está ligada a outro lead.",
    });
  });
});

describe("origem por mensagem ao criar o lead", () => {
  const regra = (ops: Array<{ tabela: string; op: string }>) =>
    ops.filter((o) => o.tabela === "rpc" && o.op === "aplicar_regras_de_origem_ao_lead");

  it("lead sem anúncio é entregue às regras de origem, com o id do lead criado", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    await criarLeadDaConversa(db, base);
    const chamadas = regra(ops) as unknown as Array<{ args: Array<{ p_lead_id: string }> }>;
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].args[0]).toEqual({ p_lead_id: "lead1" });
  });

  it("conversa de anúncio não passa pelas regras (a origem já é comprovada)", async () => {
    const { db, ops } = criarBanco({
      wa_conversations: { select: conversa({ origin: { source_id: "AD9" } }) },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    await criarLeadDaConversa(db, base);
    expect(regra(ops)).toHaveLength(0);
  });

  it("falha ao aplicar as regras NUNCA impede a criação do lead", async () => {
    const { db } = criarBanco({
      wa_conversations: { select: conversa() },
      wa_contacts: { select: contato },
      leads: { select: [], insert: { id: "lead1" } },
    });
    const original = db.rpc.bind(db);
    (db as unknown as { rpc: unknown }).rpc = (fn: string, args: unknown) => {
      if (fn === "aplicar_regras_de_origem_ao_lead") throw new Error("banco fora");
      return original(fn as never, args as never);
    };
    expect(await criarLeadDaConversa(db, base)).toEqual({
      ok: true,
      leadId: "lead1",
      jaLigado: false,
    });
  });
});
