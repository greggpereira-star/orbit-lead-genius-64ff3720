import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "../whatsapp/cloud/cifra";
import { criarDb } from "../whatsapp/cloud/dbFalso";
import { enviarFaixaDoQuiz } from "./faixaDoQuiz";

const chave = randomBytes(32).toString("base64");

const tabelas = (janelaAberta: boolean) => ({
  wa_phone_numbers: [{ phone_number_id: "PNID", account_id: "acc1" }],
  wa_conversations: {
    id: "conv1",
    company_id: "emp",
    phone_number_id: "np1",
    contact_id: "k1",
    last_inbound_at: janelaAberta ? new Date(Date.now() - 3600_000).toISOString() : null,
  },
  wa_contacts: { wa_id: "5527996318075", opted_out_at: null },
  wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
  whatsapp_optouts: [],
  wa_templates: {
    status: "APPROVED",
    components: [{ type: "BODY", text: "Oi {{1}}! Sua faixa é {{2}}." }],
  },
});

const base = {
  companyId: "emp",
  leadId: "lead1",
  numero: "5527996318075",
  nome: "Ana",
  texto: "Olá Ana, seu diagnóstico saiu.",
  dados: { nome: "Ana", faixa: "A", dor_principal: "custo" },
};

describe("enviarFaixaDoQuiz — API oficial", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: "wamid.Q1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("com template: envia template (sem janela) com as variáveis mapeadas", async () => {
    const { db, rpcs } = criarDb({
      tabelas: tabelas(false),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" }, wa_registrar_saida: { data: "m" } },
    });
    const r = await enviarFaixaDoQuiz(db, {
      ...base,
      template: {
        nome: "diagnostico",
        idioma: "pt_BR",
        variaveis: { "1": "{{nome}}", "2": "{{faixa}}" },
      },
    });
    expect(r).toEqual({ enviou: true });
    const corpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo.type).toBe("template");
    expect(corpo.template.components[0].parameters).toEqual([
      { type: "text", text: "Ana" },
      { type: "text", text: "A" },
    ]);
    expect(rpcs.find((x) => x.fn === "wa_obter_ou_criar_conversa")!.args).toMatchObject({
      p_lead_id: "lead1",
    });
  });

  it("só texto e janela FECHADA: não envia e diz o que configurar", async () => {
    const { db } = criarDb({
      tabelas: tabelas(false),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await enviarFaixaDoQuiz(db, { ...base, template: null });
    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain("template");
    expect(r.retentavel).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("só texto com a janela aberta: envia", async () => {
    const { db } = criarDb({
      tabelas: tabelas(true),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" }, wa_registrar_saida: { data: "m" } },
    });
    expect(await enviarFaixaDoQuiz(db, { ...base, template: null })).toEqual({ enviou: true });
  });

  it("template não aprovado: motivo claro, nada enviado", async () => {
    const t = tabelas(false);
    (t.wa_templates as Record<string, unknown>).status = "PENDING";
    const { db } = criarDb({ tabelas: t, rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } } });
    const r = await enviarFaixaDoQuiz(db, { ...base, template: { nome: "diagnostico" } });
    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain("aprovado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha temporária da Meta é retentável (devolve a reserva e tenta depois)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 130429, message: "rate" } }), { status: 429 }),
    );
    const { db } = criarDb({
      tabelas: tabelas(false),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await enviarFaixaDoQuiz(db, {
      ...base,
      template: { nome: "diagnostico", variaveis: { "1": "{{nome}}", "2": "{{faixa}}" } },
    });
    expect(r).toMatchObject({ enviou: false, retentavel: true });
  });

  it("faixa sem template nem texto não envia nada", async () => {
    const { db } = criarDb({
      tabelas: tabelas(true),
      rpc: { wa_obter_ou_criar_conversa: { data: "conv1" } },
    });
    const r = await enviarFaixaDoQuiz(db, { ...base, texto: "  ", template: null });
    expect(r.enviou).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
