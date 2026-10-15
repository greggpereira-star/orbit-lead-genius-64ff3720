import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cifrarToken } from "../whatsapp/cloud/cifra";
import { criarDb, rotearFetch } from "../whatsapp/cloud/dbFalso";
import {
  acaoAtribuirConversa,
  acaoEnviarWhatsApp,
  preencher,
  valoresDoTemplate,
} from "./acoesDeWhatsApp";

const chave = randomBytes(32).toString("base64");

/** Empresa COM número oficial conectado. */
const tabelasCloud = (over: Record<string, unknown> = {}) => ({
  wa_phone_numbers: [{ phone_number_id: "PNID", account_id: "acc1" }],
  wa_conversations: {
    id: "conv1",
    company_id: "emp",
    phone_number_id: "np1",
    contact_id: "k1",
    last_inbound_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // janela aberta
  },
  wa_contacts: { wa_id: "5527996318075", opted_out_at: null },
  wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
  whatsapp_optouts: [],
  wa_templates: {
    status: "APPROVED",
    components: [{ type: "BODY", text: "Olá {{1}}, recebemos seu contato." }],
  },
  whatsapp_automation_settings: null,
  ...over,
});

const job = (over: Record<string, unknown> = {}) => ({
  company_id: "emp",
  lead_id: "lead1",
  payload: { telefone: "(27) 99631-8075", nome: "Ana", origem: "formulario" } as Record<
    string,
    unknown
  >,
  ...over,
});

describe("preencher / valoresDoTemplate", () => {
  it("troca {{campo}} e ausente vira vazio", () => {
    expect(preencher("Oi {{nome}} de {{cidade}}", { nome: "Ana" })).toBe("Oi Ana de ");
  });
  it("mapeia variáveis numeradas a partir do payload", () => {
    expect(
      valoresDoTemplate(
        { "1": "{{nome}}", "2": "pedido {{origem}}" },
        { nome: "Ana", origem: "form" },
      ),
    ).toEqual({
      1: "Ana",
      2: "pedido form",
    });
  });
  it("ignora chaves que não são números positivos e valores que não são texto", () => {
    expect(valoresDoTemplate({ "0": "x", a: "y", "1": 5 }, {})).toEqual({});
    expect(valoresDoTemplate(null, {})).toEqual({});
  });
});

describe("acaoEnviarWhatsApp — API oficial", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    vi.stubEnv("EVOLUTION_API_URL", "");
    // 15h em São Paulo: dentro do horário padrão (8h–21h).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T18:00:00Z"));
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.AUT" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const cfgTemplate = { template: "boas_vindas", idioma: "pt_BR", variaveis: { "1": "{{nome}}" } };

  it("template a lead que veio de formulário: abre a conversa e envia", async () => {
    const { db, rpcs } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" }, wa_registrar_saida: { data: "m1" } },
    });
    const r = await acaoEnviarWhatsApp(db, job(), cfgTemplate, "enviar_template");
    expect(r).toMatchObject({ acao: "enviar_template", status: "ok", detalhe: "5527996318075" });

    const abre = rpcs.find((x) => x.fn === "wa_obter_ou_criar_conversa")!;
    expect(abre.args).toMatchObject({
      p_company_id: "emp",
      p_wa_id: "5527996318075",
      p_lead_id: "lead1",
    });

    const corpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Ana" }] },
    ]);
    expect(rpcs.find((x) => x.fn === "wa_registrar_saida")!.args).toMatchObject({
      p_origin: "automation",
    });
  });

  it("resposta a mensagem recebida reaproveita a conversa do evento (sem criar outra)", async () => {
    const { db, rpcs } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_registrar_saida: { data: "m" } },
    });
    const r = await acaoEnviarWhatsApp(
      db,
      job({
        payload: {
          telefone: "5527996318075",
          wa_id: "5527996318075",
          conversation_id: "conv1",
          nome: "Ana",
        },
      }),
      cfgTemplate,
      "enviar_template",
    );
    expect(r.status).toBe("ok");
    expect(rpcs.some((x) => x.fn === "wa_obter_ou_criar_conversa")).toBe(false);
  });

  it("TEXTO com a janela aberta vai", async () => {
    const { db } = criarDb({ tabelas: tabelasCloud(), rpc: { wa_registrar_saida: { data: "m" } } });
    const r = await acaoEnviarWhatsApp(
      db,
      job({
        payload: { telefone: "5527996318075", wa_id: "5527996318075", conversation_id: "conv1" },
      }),
      { mensagem: "Obrigado, {{nome}}!" },
      "enviar_whatsapp",
    );
    expect(r.status).toBe("ok");
  });

  it("TEXTO fora da janela é pulado com o motivo — e nunca chama a Meta", async () => {
    const t = tabelasCloud();
    (t.wa_conversations as Record<string, unknown>).last_inbound_at = new Date(
      Date.now() - 30 * 3600 * 1000,
    ).toISOString();
    const { db } = criarDb({ tabelas: t, rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } } });
    const r = await acaoEnviarWhatsApp(db, job(), { mensagem: "Olá {{nome}}" }, "enviar_whatsapp");
    expect(r.status).toBe("pulada");
    expect(r.detalhe).toContain("Enviar template");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lead que pediu para parar: pulada, REGISTRADA, sem chamada", async () => {
    const t = tabelasCloud({ whatsapp_optouts: [{ phone: "5527996318075" }] });
    const { db, ops } = criarDb({
      tabelas: t,
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await acaoEnviarWhatsApp(db, job(), cfgTemplate, "enviar_template");
    expect(r).toMatchObject({
      status: "pulada",
      detalhe: "Contato pediu para não receber mensagens",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const log = ops.find((o) => o.tabela === "whatsapp_messages" && o.op === "insert");
    expect(log?.args[0]).toMatchObject({
      status: "skipped",
      skipped_reason: "Contato pediu para não receber mensagens",
      kind: "automacao",
    });
  });

  it("fora do horário comercial: pulada", async () => {
    vi.setSystemTime(new Date("2026-10-16T03:00:00Z")); // 00h em SP
    const { db } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await acaoEnviarWhatsApp(db, job(), cfgTemplate, "enviar_template");
    expect(r.status).toBe("pulada");
    expect(r.detalhe).toContain("Fora da janela");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("alerta a número FIXO da empresa não é barrado pelo horário de lead", async () => {
    vi.setSystemTime(new Date("2026-10-16T03:00:00Z")); // 00h em SP
    const { db } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv9" }, wa_registrar_saida: { data: "m" } },
    });
    const r = await acaoEnviarWhatsApp(
      db,
      job(),
      { ...cfgTemplate, para: "(27) 98888-7777" },
      "enviar_template",
    );
    expect(r.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("erro NÃO retentável da Meta (número fora do WhatsApp) vira 'pulada', não gasta tentativas", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 131030, message: "not a WhatsApp user" } }), {
        status: 400,
      }),
    );
    const { db } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await acaoEnviarWhatsApp(db, job(), cfgTemplate, "enviar_template");
    expect(r.status).toBe("pulada");
  });

  it("erro retentável (limite de taxa) volta para a fila", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 130429, message: "rate limit" } }), {
        status: 429,
      }),
    );
    const { db } = criarDb({
      tabelas: tabelasCloud(),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await acaoEnviarWhatsApp(db, job(), cfgTemplate, "enviar_template");
    expect(r.status).toBe("falhou");
  });

  it("sem template configurado ou sem telefone: pulada", async () => {
    const { db } = criarDb({ tabelas: tabelasCloud() });
    expect(
      (await acaoEnviarWhatsApp(db, job(), { idioma: "pt_BR" }, "enviar_template")).status,
    ).toBe("pulada");
    expect(
      (await acaoEnviarWhatsApp(db, job({ payload: {} }), cfgTemplate, "enviar_template")).status,
    ).toBe("pulada");
  });

  it("telefone inválido: pulada, sem abrir conversa", async () => {
    const { db, rpcs } = criarDb({ tabelas: tabelasCloud() });
    const r = await acaoEnviarWhatsApp(
      db,
      job({ payload: { telefone: "abc" } }),
      cfgTemplate,
      "enviar_template",
    );
    expect(r.status).toBe("pulada");
    expect(rpcs.some((x) => x.fn === "wa_obter_ou_criar_conversa")).toBe(false);
  });
});

describe("acaoAtribuirConversa", () => {
  const j = (p: Record<string, unknown> = {}) => ({
    company_id: "emp",
    lead_id: "lead1",
    payload: { conversation_id: "conv1", ...p },
  });

  it("atribui ao usuário da regra, se for membro", async () => {
    const { db, ops } = criarDb({ tabelas: { memberships: { user_id: "u1" } } });
    const r = await acaoAtribuirConversa(db, j(), { user_id: "u1" });
    expect(r).toMatchObject({ status: "ok", detalhe: "u1" });
    const up = ops.find((o) => o.tabela === "wa_conversations" && o.op === "update")!;
    expect(up.args[0]).toEqual({ assigned_to: "u1" });
  });

  it("sem usuário na regra, usa o responsável do lead", async () => {
    const { db } = criarDb({
      tabelas: { leads: { assigned_to: "u9" }, memberships: { user_id: "u9" } },
    });
    expect(await acaoAtribuirConversa(db, j(), {})).toMatchObject({ status: "ok", detalhe: "u9" });
  });

  it("não-membro é recusado — uma conversa não pode sumir da fila de todos", async () => {
    const { db, ops } = criarDb({ tabelas: { memberships: null } });
    const r = await acaoAtribuirConversa(db, j(), { user_id: "intruso" });
    expect(r.status).toBe("falhou");
    expect(ops.some((o) => o.tabela === "wa_conversations" && o.op === "update")).toBe(false);
  });

  it("sem conversa ou sem responsável: pulada", async () => {
    const { db } = criarDb({});
    expect(
      (await acaoAtribuirConversa(db, { company_id: "emp", lead_id: null, payload: {} }, {}))
        .status,
    ).toBe("pulada");
    expect((await acaoAtribuirConversa(db, j(), {})).status).toBe("pulada");
  });
});

describe("o despachante delega às ações testadas", () => {
  const f = readFileSync("src/routes/api/public/cron/automation-dispatch.ts", "utf8");
  it("enviar_whatsapp, enviar_template e atribuir_conversa", () => {
    expect(f).toContain("acaoEnviarWhatsApp(admin, job, cfg, tipo)");
    expect(f).toContain("acaoAtribuirConversa(admin, job, cfg)");
    expect(f).toContain("case 'enviar_template':");
    expect(f).toContain("case 'atribuir_conversa':");
  });
  it("não fala com a Evolution direto (continua isolada no provedor)", () => {
    expect(f).not.toContain("evolution.server");
  });
});
