import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { criarDb, rotearFetch } from "./dbFalso";
import { mensagemDaMetaEmPortugues } from "./erros";
import { lerSituacaoDosNumeros } from "./onboarding";
import { situacaoDoNumeroNaMeta } from "./situacaoDoNumero";

describe("mensagemDaMetaEmPortugues", () => {
  it("'Unsupported get request … missing permissions' vira instrução de token/ID", () => {
    const t = mensagemDaMetaEmPortugues(
      100,
      "Unsupported get request. Object with ID '1357165290819369' does not exist, cannot be loaded due to missing permissions, or does not support this operation.",
    );
    expect(t).toContain("O token não tem acesso a este recurso");
    expect(t).toContain("Etapa 1");
    expect(t).not.toContain("Unsupported");
  });
  it("token expirado (190) e permissões (200)", () => {
    expect(
      mensagemDaMetaEmPortugues(190, "Error validating access token: Session has expired"),
    ).toContain("expirou");
    expect(
      mensagemDaMetaEmPortugues(200, "(#200) Requires whatsapp_business_management permission"),
    ).toContain("whatsapp_business_management");
  });
  it("limite de uso (4, 17, 80007)", () => {
    for (const c of [4, 17, 80007])
      expect(mensagemDaMetaEmPortugues(c, "x")).toContain("limitou as chamadas");
  });
  it("o que não é reconhecido volta como a Meta mandou (não esconde erro novo)", () => {
    expect(mensagemDaMetaEmPortugues(100, "Invalid parameter")).toBe("Invalid parameter");
    expect(mensagemDaMetaEmPortugues(null, undefined, 502)).toBe("HTTP 502");
  });
});

describe("situacaoDoNumeroNaMeta", () => {
  it("CONNECTED é ok; PENDING avisa o que fazer", () => {
    expect(situacaoDoNumeroNaMeta("CONNECTED")).toMatchObject({ nivel: "ok", dica: null });
    const p = situacaoDoNumeroNaMeta("pending");
    expect(p).toMatchObject({ nivel: "aviso", rotulo: "Pendente na Meta" });
    expect(p.dica).toContain("não envia nem recebe");
  });
  it("banido é erro; vazio é 'indisponível', não 'ok'", () => {
    expect(situacaoDoNumeroNaMeta("BANNED").nivel).toBe("erro");
    expect(situacaoDoNumeroNaMeta(null)).toMatchObject({ nivel: "desconhecido" });
    expect(situacaoDoNumeroNaMeta("ALGO_NOVO").rotulo).toBe("Meta: algo_novo");
  });
});

describe("lerSituacaoDosNumeros", () => {
  const chave = randomBytes(32).toString("base64");
  beforeEach(() => vi.stubEnv("WA_TOKEN_KEY", chave));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("um número por vez: o que falha não derruba o outro, e o erro vem em português", async () => {
    const { f } = rotearFetch({
      "/PN1": { corpo: { id: "PN1", status: "CONNECTED" } },
      "/PN2": {
        status: 400,
        corpo: {
          error: {
            code: 100,
            message:
              "Unsupported get request. Object with ID 'PN2' does not exist, cannot be loaded due to missing permissions",
          },
        },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({
      tabelas: {
        wa_phone_numbers: [
          { phone_number_id: "PN1", account_id: "acc1" },
          { phone_number_id: "PN2", account_id: "acc1" },
        ],
        wa_accounts: { id: "acc1", waba_id: "W" },
        wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
      },
    });
    const r = await lerSituacaoDosNumeros(db, "emp");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ phone_number_id: "PN1", status: "CONNECTED", erro: null });
    expect(r[1].status).toBeNull();
    expect(r[1].erro).toContain("O token não tem acesso a este recurso");
  });

  it("sem credencial: diz isso e não chama a Meta", async () => {
    const { f } = rotearFetch({});
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({
      tabelas: { wa_phone_numbers: [{ phone_number_id: "PN1", account_id: "acc1" }] },
    });
    const r = await lerSituacaoDosNumeros(db, "emp");
    expect(r[0]).toMatchObject({ status: null, erro: "Sem credencial salva para esta conta." });
    expect(f).not.toHaveBeenCalled();
  });

  it("o token não aparece no retorno", async () => {
    const { f } = rotearFetch({ "/PN1": { corpo: { id: "PN1", status: "PENDING" } } });
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({
      tabelas: {
        wa_phone_numbers: [{ phone_number_id: "PN1", account_id: "acc1" }],
        wa_accounts: { id: "acc1", waba_id: "W" },
        wa_credentials: { access_token_enc: cifrarToken("SEGREDO-123", chave) },
      },
    });
    expect(JSON.stringify(await lerSituacaoDosNumeros(db, "emp"))).not.toContain("SEGREDO-123");
  });
});
