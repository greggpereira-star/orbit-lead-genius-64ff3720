import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { criarDb } from "./dbFalso";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "./envio";

/**
 * O opt-out pode existir só na lista legada (`whatsapp_optouts`, da época da
 * Evolution) enquanto o contato oficial ainda não está marcado. O servidor já
 * bloqueava; a tela, que lê só o contato, mostrava o composer liberado. Agora o
 * bloqueio também marca o contato.
 */
describe("opt-out só na lista legada", () => {
  const chave = randomBytes(32).toString("base64");
  const tabelas = (optoutLegado: boolean, contatoOptado: string | null = null) => ({
    wa_conversations: {
      id: "c1",
      company_id: "emp",
      phone_number_id: "np1",
      contact_id: "k1",
      last_inbound_at: new Date(Date.now() - 3600_000).toISOString(),
    },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: contatoOptado },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1", receive_only: false },
    wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
    whatsapp_optouts: optoutLegado ? [{ phone: "5527996318075" }] : [],
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

  const texto = (db: ReturnType<typeof criarDb>["db"]) =>
    enviarTextoNaConversa(db, { conversaId: "c1", texto: "Oi", enviadoPor: null, origem: "agent" });
  const gravouNoContato = (ops: ReturnType<typeof criarDb>["ops"]) =>
    ops.find((o) => o.tabela === "wa_contacts" && o.op === "update");

  it("bloqueia o texto, não chama a Meta e marca o contato como optado", async () => {
    const { db, ops } = criarDb({
      tabelas: tabelas(true),
      rpc: { wa_registrar_saida: { data: "m-1" } },
    });
    const r = await texto(db);
    expect(r).toMatchObject({ ok: false, motivo: "contato_pediu_para_parar" });
    expect(fetchMock).not.toHaveBeenCalled();
    const up = gravouNoContato(ops);
    expect((up?.args[0] as { opted_out_at?: string }).opted_out_at).toBeTruthy();
    expect(
      ops.some(
        (o) =>
          o.tabela === "wa_contacts" && o.op === "eq" && o.args[0] === "id" && o.args[1] === "k1",
      ),
    ).toBe(true);
  });

  it("o template também bloqueia e alinha o contato", async () => {
    const { db, ops } = criarDb({
      tabelas: tabelas(true),
      rpc: { wa_registrar_saida: { data: "m-1" } },
    });
    const r = await enviarTemplateNaConversa(db, {
      conversaId: "c1",
      nome: "ola",
      idioma: "pt_BR",
      valores: {},
      enviadoPor: null,
      origem: "agent",
    });
    expect(r).toMatchObject({ ok: false, motivo: "contato_pediu_para_parar" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gravouNoContato(ops)).toBeTruthy();
  });

  it("contato já marcado: bloqueia sem regravar", async () => {
    const { db, ops } = criarDb({ tabelas: tabelas(true, "2026-10-14T00:00:00Z") });
    expect(await texto(db)).toMatchObject({ ok: false, motivo: "contato_pediu_para_parar" });
    expect(gravouNoContato(ops)).toBeUndefined();
  });

  it("quem não pediu para parar envia normalmente e o contato não é tocado", async () => {
    const { db, ops } = criarDb({
      tabelas: tabelas(false),
      rpc: { wa_registrar_saida: { data: "m-1" } },
    });
    expect(await texto(db)).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalled();
    expect(gravouNoContato(ops)).toBeUndefined();
  });
});
