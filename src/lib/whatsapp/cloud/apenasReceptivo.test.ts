import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { criarDb } from "./dbFalso";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "./envio";
import { estadoDaJanela } from "./janela";
import { modoDoCompositor } from "../../../modules/atendimento/lib/compositor";

describe("número apenas receptivo (envio)", () => {
  const chave = randomBytes(32).toString("base64");
  const tabelas = (receptivo: boolean) => ({
    wa_conversations: {
      id: "c1",
      company_id: "emp",
      phone_number_id: "np1",
      contact_id: "k1",
      last_inbound_at: new Date(Date.now() - 3600_000).toISOString(),
    },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: null },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1", receive_only: receptivo },
    wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
    whatsapp_optouts: [],
    wa_templates: { status: "APPROVED", components: [{ type: "BODY", text: "Oi" }] },
    wa_messages: { __count: 0 },
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

  const texto = (db: ReturnType<typeof criarDb>["db"], origem: "agent" | "automation") =>
    enviarTextoNaConversa(db, { conversaId: "c1", texto: "Oi", enviadoPor: null, origem });
  const template = (db: ReturnType<typeof criarDb>["db"], origem: "agent" | "automation") =>
    enviarTemplateNaConversa(db, {
      conversaId: "c1",
      nome: "ola",
      idioma: "pt_BR",
      valores: {},
      enviadoPor: null,
      origem,
    });
  const rpc = { wa_registrar_saida: { data: "m-1" } };

  it("o atendente RESPONDE dentro da janela (é resposta, não mensagem ativa)", async () => {
    const { db } = criarDb({ tabelas: tabelas(true), rpc });
    expect(await texto(db, "agent")).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("automação/campanha NÃO sai por número apenas receptivo", async () => {
    const { db } = criarDb({ tabelas: tabelas(true), rpc });
    expect(await texto(db, "automation")).toMatchObject({
      ok: false,
      motivo: "canal_apenas_receptivo",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("template (mensagem ativa) NÃO sai, nem pelo atendente", async () => {
    for (const origem of ["agent", "automation"] as const) {
      const { db } = criarDb({ tabelas: tabelas(true), rpc });
      expect(await template(db, origem)).toMatchObject({
        ok: false,
        motivo: "canal_apenas_receptivo",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com a opção desligada nada muda: automação e template saem", async () => {
    const a = criarDb({ tabelas: tabelas(false), rpc });
    expect(await texto(a.db, "automation")).toMatchObject({ ok: true });
    const b = criarDb({ tabelas: tabelas(false), rpc });
    expect(await template(b.db, "agent")).toMatchObject({ ok: true });
  });
});

describe("compositor e servidor", () => {
  const fechada = estadoDaJanela(null);
  const aberta = estadoDaJanela(new Date().toISOString());

  it("fora da janela, número receptivo não oferece template", () => {
    const base = { optedOut: false, status: "open" as const };
    expect(modoDoCompositor({ ...base, janela: fechada, apenasReceptivo: true })).toBe(
      "somente_receptivo",
    );
    expect(modoDoCompositor({ ...base, janela: fechada })).toBe("template");
    // Dentro da janela o atendente responde normalmente.
    expect(modoDoCompositor({ ...base, janela: aberta, apenasReceptivo: true })).toBe("texto");
  });

  it("opt-out e conversa resolvida continuam vencendo", () => {
    expect(
      modoDoCompositor({
        janela: fechada,
        optedOut: true,
        status: "open",
        apenasReceptivo: true,
      }),
    ).toBe("bloqueado");
    expect(
      modoDoCompositor({
        janela: fechada,
        optedOut: false,
        status: "resolved",
        apenasReceptivo: true,
      }),
    ).toBe("resolvida");
  });

  it("alterar a opção exige administrador e só mexe em número DA empresa", () => {
    const s = readFileSync("src/lib/whatsapp-cloud.functions.ts", "utf8");
    const i = s.indexOf("export const definirApenasReceptivoWhatsApp");
    const f = s.slice(i, s.indexOf("\nexport const ", i + 10));
    expect(f).toContain("empresaParaAdministrar(admin, context.userId)");
    expect(f).toContain('.eq("company_id", companyId)');
  });
});

describe("mídia", () => {
  it("automação não envia mídia por número apenas receptivo; o atendente, sim", () => {
    const fonte = readFileSync("src/lib/whatsapp/cloud/envio.ts", "utf8");
    const i = fonte.indexOf("export async function enviarMidiaNaConversa");
    const f = fonte.slice(i);
    expect(f).toContain('if (nm.receive_only && e.origem === "automation")');
  });
});
