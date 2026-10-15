import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { decidirTeto, tetosDoAmbiente } from "./tetoDeEnvio";
import { criarDb } from "./dbFalso";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "./envio";

describe("decidirTeto", () => {
  const t = { porConversaPorDia: 5, porEmpresaPorHora: 300 };
  it("abaixo dos tetos libera", () => {
    expect(decidirTeto({ naConversaHoje: 4, naEmpresaNaHora: 299 }, t)).toEqual({ ok: true });
  });
  it("no teto da conversa NÃO libera (a quinta já saiu)", () => {
    expect(decidirTeto({ naConversaHoje: 5, naEmpresaNaHora: 0 }, t)).toMatchObject({ ok: false });
  });
  it("no teto da empresa NÃO libera", () => {
    expect(decidirTeto({ naConversaHoje: 0, naEmpresaNaHora: 300 }, t)).toMatchObject({
      ok: false,
    });
  });
  it("contagem que falhou (Infinity) bloqueia", () => {
    expect(
      decidirTeto({ naConversaHoje: Number.POSITIVE_INFINITY, naEmpresaNaHora: 0 }, t).ok,
    ).toBe(false);
  });
  it("ambiente: valor inválido cai no padrão", () => {
    expect(tetosDoAmbiente({ WA_TETO_AUTOMACAO_DIA: "abc", WA_TETO_AUTOMACAO_HORA: "-3" })).toEqual(
      {
        porConversaPorDia: 5,
        porEmpresaPorHora: 300,
      },
    );
    expect(tetosDoAmbiente({ WA_TETO_AUTOMACAO_DIA: "2", WA_TETO_AUTOMACAO_HORA: "50" })).toEqual({
      porConversaPorDia: 2,
      porEmpresaPorHora: 50,
    });
  });
});

describe("o teto vale para envio automático e NÃO para o atendente", () => {
  const chave = randomBytes(32).toString("base64");
  const tabelas = (enviadas: number) => ({
    wa_conversations: {
      id: "c1",
      company_id: "emp",
      phone_number_id: "np1",
      contact_id: "k1",
      last_inbound_at: new Date(Date.now() - 3600_000).toISOString(),
    },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: null },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1" },
    wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
    whatsapp_optouts: [],
    wa_templates: { status: "APPROVED", components: [{ type: "BODY", text: "Oi" }] },
    wa_messages: { __count: enviadas },
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

  /** O fake devolve `count` quando a tabela traz `__count`. */
  function db(enviadas: number) {
    const x = criarDb({ tabelas: tabelas(enviadas), rpc: { wa_registrar_saida: { data: "m" } } });
    const original = x.db.from.bind(x.db);
    x.db.from = (nome: string) => {
      const b = original(nome) as Record<string, unknown>;
      if (nome === "wa_messages") {
        b.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ count: enviadas, data: null, error: null }).then(ok);
      }
      return b;
    };
    return x.db;
  }

  it("automação com a conversa no teto: não chama a Meta", async () => {
    const r = await enviarTextoNaConversa(db(5), {
      conversaId: "c1",
      texto: "oi",
      enviadoPor: null,
      origem: "automation",
    });
    expect(r).toMatchObject({ ok: false, motivo: "limite_de_envio" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("automação abaixo do teto envia", async () => {
    const r = await enviarTextoNaConversa(db(1), {
      conversaId: "c1",
      texto: "oi",
      enviadoPor: null,
      origem: "automation",
    });
    expect(r.ok).toBe(true);
  });

  it("template automático também respeita o teto", async () => {
    const r = await enviarTemplateNaConversa(db(5), {
      conversaId: "c1",
      nome: "t",
      idioma: "pt_BR",
      valores: {},
      enviadoPor: null,
      origem: "automation",
    });
    expect(r).toMatchObject({ ok: false, motivo: "limite_de_envio" });
  });

  it("o ATENDENTE não é limitado: responde o cliente quantas vezes precisar", async () => {
    const r = await enviarTextoNaConversa(db(999), {
      conversaId: "c1",
      texto: "oi",
      enviadoPor: "u1",
      origem: "agent",
    });
    expect(r.ok).toBe(true);
  });
});
