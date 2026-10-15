import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "./envio";
import type { EventoWa } from "./payload";
import {
  guardarEventos,
  processarEvento,
  processarPendentes,
  referralParaClique,
  type DbWa,
} from "./processador";

/** Banco de mentira: registra operações e responde por tabela. */
function criarDb(config: {
  tabelas?: Record<string, unknown>; // `data` devolvido por tabela
  rpc?: Record<string, { data?: unknown; error?: { message: string; code?: string } | null }>;
}) {
  const ops: Array<{ tabela: string; op: string; args: unknown[] }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {};
    const resposta = () => ({ data: config.tabelas?.[tabela] ?? null, error: null });
    for (const op of ["select", "eq", "in", "lt", "ilike", "order", "limit", "update", "upsert"]) {
      b[op] = (...args: unknown[]) => {
        ops.push({ tabela, op, args });
        return b;
      };
    }
    b.maybeSingle = () => {
      const r = resposta();
      const d = r.data;
      return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: null });
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

const mensagem = (extra: Partial<Extract<EventoWa, { kind: "message" }>> = {}): EventoWa => ({
  kind: "message",
  dedupKey: "msg:w1",
  phoneNumberId: "PNID",
  waId: "5527996318075",
  profileName: "Ana",
  wamid: "w1",
  type: "text",
  body: "olá",
  payload: { id: "w1" },
  ts: "2026-10-15T10:00:00.000Z",
  referral: null,
  replyToWamid: null,
  ...extra,
});

const NOVA = {
  data: [{ out_conversa: "c1", out_mensagem: "m1", out_empresa: "emp", inserida: true }],
};
const REENTREGA = {
  data: [{ out_conversa: "c1", out_mensagem: "m1", out_empresa: "emp", inserida: false }],
};

describe("processarEvento — mensagem do cliente", () => {
  it("chama a função de ingestão com os campos certos", async () => {
    const { db, rpcs } = criarDb({ rpc: { wa_registrar_mensagem: NOVA } });
    await processarEvento(db, mensagem());
    expect(rpcs[0].fn).toBe("wa_registrar_mensagem");
    expect(rpcs[0].args).toMatchObject({
      p_phone_number_id: "PNID",
      p_wa_id: "5527996318075",
      p_direction: "inbound",
      p_origin: "customer",
      p_provider_message_id: "w1",
      p_body: "olá",
    });
  });

  it("reentrega NÃO dispara efeito colateral (lead, anúncio, opt-out)", async () => {
    const { db, ops } = criarDb({ rpc: { wa_registrar_mensagem: REENTREGA } });
    await processarEvento(
      db,
      mensagem({ body: "SAIR", referral: { ctwa_clid: "C", source_id: "A" } }),
    );
    expect(ops).toEqual([]);
  });

  it("liga o contato ao lead pelo telefone (com o 9º dígito em outro formato)", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: NOVA },
      tabelas: {
        wa_conversations: { contact_id: "k1", lead_id: null },
        // o lead guardou o número sem o 9
        leads: [{ id: "L1", phone: "(27) 9631-8075", email: null }],
      },
    });
    await processarEvento(db, mensagem());
    const upd = ops.filter((o) => o.op === "update");
    expect(upd.find((o) => o.tabela === "wa_contacts")?.args[0]).toEqual({ lead_id: "L1" });
    expect(upd.find((o) => o.tabela === "wa_conversations")?.args[0]).toEqual({ lead_id: "L1" });
  });

  it("lead com outro DDD não é vinculado", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: NOVA },
      tabelas: {
        wa_conversations: { contact_id: "k1", lead_id: null },
        leads: [{ id: "L2", phone: "(21) 99631-8075", email: null }],
      },
    });
    await processarEvento(db, mensagem());
    expect(ops.filter((o) => o.op === "update")).toEqual([]);
  });

  it("referral grava o clique de anúncio", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: NOVA },
      tabelas: { wa_conversations: { contact_id: "k1", lead_id: "L1" } },
    });
    await processarEvento(db, mensagem({ referral: { ctwa_clid: "CLID", source_id: "AD" } }));
    const up = ops.find((o) => o.tabela === "whatsapp_ad_clicks" && o.op === "upsert");
    expect(up?.args[0]).toMatchObject({
      company_id: "emp",
      lead_id: "L1",
      ctwa_clid: "CLID",
      source_id: "AD",
    });
  });

  it("pedido de parada marca o contato E a lista usada pela política", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: NOVA },
      tabelas: { wa_conversations: { contact_id: "k1", lead_id: "L1" } },
    });
    await processarEvento(db, mensagem({ body: "SAIR" }));
    const contato = ops.find((o) => o.tabela === "wa_contacts" && o.op === "update");
    expect((contato?.args[0] as { opted_out_at?: string }).opted_out_at).toBeTruthy();
    const lista = ops.find((o) => o.tabela === "whatsapp_optouts" && o.op === "upsert");
    expect(lista?.args[0]).toMatchObject({ company_id: "emp", phone: "5527996318075" });
  });

  it("erro do banco sobe (o chamador marca como falho)", async () => {
    const { db } = criarDb({ rpc: { wa_registrar_mensagem: { error: { message: "boom" } } } });
    await expect(processarEvento(db, mensagem())).rejects.toThrow("boom");
  });
});

describe("processarEvento — eco, histórico e status", () => {
  it("eco entra como saída do app", async () => {
    const { db, rpcs } = criarDb({ rpc: { wa_registrar_mensagem: NOVA } });
    await processarEvento(db, {
      kind: "echo",
      dedupKey: "echo:e",
      phoneNumberId: "PNID",
      waId: "5527996318075",
      wamid: "e",
      type: "text",
      body: "oi",
      payload: {},
      ts: "2026-10-15T11:00:00.000Z",
    });
    expect(rpcs[0].args).toMatchObject({
      p_direction: "outbound",
      p_origin: "app_echo",
      p_status: "sent",
    });
  });

  it("histórico não dispara opt-out nem anúncio", async () => {
    const { db, ops, rpcs } = criarDb({ rpc: { wa_registrar_mensagem: NOVA } });
    await processarEvento(db, {
      kind: "history_message",
      dedupKey: "hist:h",
      phoneNumberId: "PNID",
      waId: "5527996318075",
      wamid: "h",
      doNegocio: false,
      type: "text",
      body: "SAIR",
      payload: {},
      ts: "2026-10-01T11:00:00.000Z",
    });
    expect(rpcs[0].args).toMatchObject({ p_origin: "history", p_direction: "inbound" });
    expect(ops).toEqual([]);
  });

  it("status vai para a função que nunca rebaixa", async () => {
    const { db, rpcs } = criarDb({ rpc: { wa_aplicar_status: { data: true } } });
    await processarEvento(db, {
      kind: "status",
      dedupKey: "st",
      phoneNumberId: "PNID",
      wamid: "w9",
      status: "failed",
      ts: "2026-10-15T12:00:00.000Z",
      pricing: null,
      error: { code: 131047, title: "Re-engagement", details: null },
    });
    expect(rpcs[0].fn).toBe("wa_aplicar_status");
    expect(rpcs[0].args).toMatchObject({ p_status: "failed", p_error: { code: 131047 } });
  });

  it("campo ignorado vira 'ignored'", async () => {
    const { db } = criarDb({});
    expect(
      await processarEvento(db, {
        kind: "ignorado",
        dedupKey: "i",
        phoneNumberId: null,
        field: "x",
        payload: {},
      }),
    ).toBe("ignored");
  });
});

describe("processarPendentes", () => {
  const linha = (payload: EventoWa, attempts = 0) => ({ id: "ev1", payload, attempts });

  it("marca processed e conta a tentativa", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: NOVA },
      tabelas: {
        wa_webhook_events: [linha(mensagem())],
        wa_conversations: { contact_id: "k", lead_id: "L" },
      },
    });
    const r = await processarPendentes(db);
    expect(r).toEqual({ processados: 1, ignorados: 0, falhos: 0 });
    const upd = ops.filter((o) => o.tabela === "wa_webhook_events" && o.op === "update");
    expect(upd[0].args[0]).toMatchObject({ status: "processed", attempts: 1 });
  });

  it("número desconhecido vira ignored, não failed", async () => {
    const { db, ops } = criarDb({
      rpc: {
        wa_registrar_mensagem: { error: { message: "numero_desconhecido:XYZ", code: "P0002" } },
      },
      tabelas: { wa_webhook_events: [linha(mensagem())] },
    });
    const r = await processarPendentes(db);
    expect(r).toEqual({ processados: 0, ignorados: 1, falhos: 0 });
    const upd = ops.filter((o) => o.op === "update" && o.tabela === "wa_webhook_events");
    expect(upd[0].args[0]).toMatchObject({ status: "ignored" });
  });

  it("erro real vira failed com a mensagem, e segue para o próximo", async () => {
    const { db, ops } = criarDb({
      rpc: { wa_registrar_mensagem: { error: { message: "conexão caiu" } } },
      tabelas: { wa_webhook_events: [linha(mensagem(), 2)] },
    });
    const r = await processarPendentes(db);
    expect(r.falhos).toBe(1);
    const upd = ops.find((o) => o.op === "update" && o.tabela === "wa_webhook_events");
    expect(upd?.args[0]).toMatchObject({
      status: "failed",
      attempts: 3,
      last_error: "conexão caiu",
    });
  });
});

describe("guardarEventos", () => {
  it("usa upsert com ignoreDuplicates pela chave de deduplicação", async () => {
    const { db, ops } = criarDb({ tabelas: { wa_webhook_events: [{ id: "1" }] } });
    await guardarEventos(db, [mensagem()]);
    const up = ops.find((o) => o.op === "upsert")!;
    expect(up.args[1]).toEqual({ onConflict: "dedup_key", ignoreDuplicates: true });
    expect((up.args[0] as Array<{ dedup_key: string }>)[0].dedup_key).toBe("msg:w1");
  });
  it("sem eventos não toca no banco", async () => {
    const { db, ops } = criarDb({});
    expect(await guardarEventos(db, [])).toBe(0);
    expect(ops).toEqual([]);
  });
});

describe("referralParaClique", () => {
  it("mapeia para o formato que a atribuição consome", () => {
    expect(
      referralParaClique({ ctwa_clid: "C", source_id: "S", headline: "H", source_url: "U" }),
    ).toMatchObject({
      ctwaClid: "C",
      sourceId: "S",
      title: "H",
      sourceUrl: "U",
    });
  });
});

describe("enviarTextoNaConversa", () => {
  const chave = randomBytes(32).toString("base64");
  const agora = new Date("2026-10-15T12:00:00Z");
  const recente = "2026-10-15T10:00:00Z"; // janela aberta
  const antiga = "2026-10-13T10:00:00Z"; // janela fechada

  const tabelasBase = (
    over: {
      last_inbound_at?: string | null;
      opted_out_at?: string | null;
      optouts?: unknown[];
    } = {},
  ) => ({
    wa_conversations: {
      id: "c1",
      company_id: "emp",
      phone_number_id: "np1",
      contact_id: "k1",
      last_inbound_at: over.last_inbound_at === undefined ? recente : over.last_inbound_at,
    },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: over.opted_out_at ?? null },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1" },
    wa_credentials: { access_token_enc: cifrarToken("TOKEN-REAL", chave) },
    whatsapp_optouts: over.optouts ?? [],
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const entrada = {
    conversaId: "c1",
    texto: "Posso ajudar?",
    enviadoPor: "u1",
    origem: "agent" as const,
    agora,
  };

  it("janela aberta: envia com o token certo, no número certo, e registra", async () => {
    const { db, rpcs } = criarDb({
      tabelas: tabelasBase(),
      rpc: { wa_registrar_saida: { data: "msg-1" } },
    });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: true, providerMessageId: "wamid.OK" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/PNID/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN-REAL");
    const corpo = JSON.parse(String(init.body));
    expect(corpo).toMatchObject({
      messaging_product: "whatsapp",
      to: "5527996318075",
      type: "text",
    });
    expect(corpo.text.body).toBe("Posso ajudar?");

    expect(rpcs[0].fn).toBe("wa_registrar_saida");
    expect(rpcs[0].args).toMatchObject({
      p_provider_message_id: "wamid.OK",
      p_origin: "agent",
      p_sent_by: "u1",
    });
  });

  it("janela FECHADA: não chama a Meta", async () => {
    const { db } = criarDb({ tabelas: tabelasBase({ last_inbound_at: antiga }) });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: false, motivo: "fora_da_janela" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem mensagem do cliente nunca: janela fechada", async () => {
    const { db } = criarDb({ tabelas: tabelasBase({ last_inbound_at: null }) });
    expect((await enviarTextoNaConversa(db, entrada)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opt-out do contato: não chama a Meta", async () => {
    const { db } = criarDb({ tabelas: tabelasBase({ opted_out_at: "2026-10-14T00:00:00Z" }) });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: false, motivo: "contato_pediu_para_parar" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opt-out na lista legada também bloqueia", async () => {
    const { db } = criarDb({ tabelas: tabelasBase({ optouts: [{ phone: "5527996318075" }] }) });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: false, motivo: "contato_pediu_para_parar" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opt-out vence a janela aberta", async () => {
    const { db } = criarDb({
      tabelas: tabelasBase({ opted_out_at: "2026-10-14T00:00:00Z", last_inbound_at: recente }),
    });
    expect((await enviarTextoNaConversa(db, entrada)).ok).toBe(false);
  });

  it("texto vazio não vai", async () => {
    const { db } = criarDb({ tabelas: tabelasBase() });
    expect(await enviarTextoNaConversa(db, { ...entrada, texto: "   " })).toMatchObject({
      motivo: "texto_vazio",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro 131047 da Meta vira mensagem em português, sem vazar o token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 131047, message: "Re-engagement message", fbtrace_id: "FB1" },
        }),
        {
          status: 400,
        },
      ),
    );
    const { db } = criarDb({ tabelas: tabelasBase() });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: false, motivo: "provedor" });
    expect((r as { texto: string }).texto).toContain("janela de 24h");
    expect(JSON.stringify(r)).not.toContain("TOKEN-REAL");
  });

  it("conta sem credencial: erro claro, e nenhuma chamada", async () => {
    const t = tabelasBase();
    (t as Record<string, unknown>).wa_credentials = null;
    const { db } = criarDb({ tabelas: t });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r).toMatchObject({ ok: false, motivo: "provedor" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registro que falha NÃO vira erro de envio (a mensagem já foi)", async () => {
    const { db } = criarDb({
      tabelas: tabelasBase(),
      rpc: { wa_registrar_saida: { error: { message: "db fora" } } },
    });
    const r = await enviarTextoNaConversa(db, entrada);
    expect(r.ok).toBe(true);
  });
});

describe("processarEvento — Fase 2", () => {
  it("template: chama a função que nunca rebaixa", async () => {
    const { db, rpcs } = criarDb({ rpc: { wa_aplicar_status_de_template: { data: true } } });
    await processarEvento(db, {
      kind: "template_status",
      dedupKey: "t",
      wabaId: "W",
      name: "boas_vindas",
      language: "pt_BR",
      status: "APPROVED",
      reason: null,
      providerTemplateId: "9",
    });
    expect(rpcs[0]).toMatchObject({
      fn: "wa_aplicar_status_de_template",
      args: { p_waba_id: "W", p_name: "boas_vindas", p_status: "APPROVED" },
    });
  });

  it("PARTNER_REMOVED e ACCOUNT_OFFBOARDED desconectam; RECONNECTED reconecta", async () => {
    for (const [evento, esperado] of [
      ["PARTNER_REMOVED", "disconnected"],
      ["ACCOUNT_OFFBOARDED", "disconnected"],
      ["ACCOUNT_RECONNECTED", "active"],
    ] as const) {
      const { db, rpcs } = criarDb({});
      await processarEvento(db, {
        kind: "conta",
        dedupKey: "c",
        wabaId: "W",
        evento,
        displayPhone: null,
        motivo: null,
      });
      expect(rpcs[0].args).toMatchObject({ p_status: esperado });
    }
  });

  it("evento de conta desconhecido é ignorado sem tocar no banco", async () => {
    const { db, rpcs } = criarDb({});
    const r = await processarEvento(db, {
      kind: "conta",
      dedupKey: "c",
      wabaId: "W",
      evento: "ALGO_NOVO",
      displayPhone: null,
      motivo: null,
    });
    expect(r).toBe("ignored");
    expect(rpcs).toEqual([]);
  });

  it("progresso do histórico", async () => {
    const { db, rpcs } = criarDb({});
    await processarEvento(db, {
      kind: "historico_progresso",
      dedupKey: "h",
      phoneNumberId: "PNID",
      progress: 100,
      phase: 2,
    });
    expect(rpcs[0]).toMatchObject({
      fn: "wa_atualizar_historico",
      args: { p_phone_number_id: "PNID", p_progress: 100 },
    });
  });
});

describe("enviarTemplateNaConversa", () => {
  const chave = randomBytes(32).toString("base64");
  const corpoDoTemplate = "Olá {{1}}, seu pedido {{2}} saiu.";
  const tabelas = (
    over: { status?: string; components?: unknown[]; opted?: string | null } = {},
  ) => ({
    wa_conversations: { id: "c1", company_id: "emp", phone_number_id: "np1", contact_id: "k1" },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: over.opted ?? null },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1" },
    wa_credentials: { access_token_enc: cifrarToken("TOKEN-REAL", chave) },
    whatsapp_optouts: [],
    wa_templates: {
      status: over.status ?? "APPROVED",
      components: over.components ?? [{ type: "BODY", text: corpoDoTemplate }],
    },
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: "wamid.T1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const entrada = {
    conversaId: "c1",
    nome: "pedido_saiu",
    idioma: "pt_BR",
    valores: { 1: "Ana", 2: "#123" },
    enviadoPor: "u1",
    origem: "agent" as const,
  };

  it("envia fora da janela (é o caminho para retomar) e registra o texto renderizado", async () => {
    const { db, rpcs } = criarDb({
      tabelas: tabelas(),
      rpc: { wa_registrar_saida: { data: "m-1" } },
    });
    const r = await enviarTemplateNaConversa(db, entrada);
    expect(r).toMatchObject({
      ok: true,
      texto: "Olá Ana, seu pedido #123 saiu.",
      providerMessageId: "wamid.T1",
    });

    const corpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo).toMatchObject({
      type: "template",
      template: { name: "pedido_saiu", language: { code: "pt_BR" } },
    });
    expect(corpo.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Ana" },
          { type: "text", text: "#123" },
        ],
      },
    ]);
    expect(rpcs[0].args).toMatchObject({
      p_type: "template",
      p_template_name: "pedido_saiu",
      p_body: "Olá Ana, seu pedido #123 saiu.",
    });
  });

  it("template não aprovado não vai", async () => {
    const { db } = criarDb({ tabelas: tabelas({ status: "PENDING" }) });
    expect(await enviarTemplateNaConversa(db, entrada)).toMatchObject({
      ok: false,
      motivo: "template_nao_aprovado",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("template inexistente", async () => {
    const t = tabelas();
    (t as Record<string, unknown>).wa_templates = null;
    const { db } = criarDb({ tabelas: t });
    expect(await enviarTemplateNaConversa(db, entrada)).toMatchObject({
      ok: false,
      motivo: "template_inexistente",
    });
  });

  it("variável faltando diz quais", async () => {
    const { db } = criarDb({ tabelas: tabelas() });
    const r = await enviarTemplateNaConversa(db, { ...entrada, valores: { 1: "Ana" } });
    expect(r).toMatchObject({ ok: false, motivo: "variavel_faltando" });
    expect((r as { texto: string }).texto).toContain("{{2}}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("variável no cabeçalho ou em botão é recusada ANTES de falar com a Meta", async () => {
    for (const components of [
      [
        { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
        { type: "BODY", text: "Oi" },
      ],
      [
        { type: "BODY", text: "Oi" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://x.com/{{1}}" }] },
      ],
    ]) {
      const { db } = criarDb({ tabelas: tabelas({ components }) });
      expect(await enviarTemplateNaConversa(db, { ...entrada, valores: {} })).toMatchObject({
        ok: false,
        motivo: "variavel_nao_suportada",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opt-out bloqueia template também", async () => {
    const { db } = criarDb({ tabelas: tabelas({ opted: "2026-10-14T00:00:00Z" }) });
    expect(await enviarTemplateNaConversa(db, entrada)).toMatchObject({
      ok: false,
      motivo: "contato_pediu_para_parar",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("template sem variável envia sem parâmetros", async () => {
    const { db } = criarDb({
      tabelas: tabelas({ components: [{ type: "BODY", text: "Obrigado pelo contato!" }] }),
      rpc: { wa_registrar_saida: { data: "m" } },
    });
    const r = await enviarTemplateNaConversa(db, { ...entrada, valores: {} });
    expect(r.ok).toBe(true);
    const corpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo.template.components).toEqual([]);
  });
});
