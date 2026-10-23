import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { segredosDoApp, verificarAssinaturaMeta } from "./assinatura";
import { cifrarToken, decifrarToken } from "./cifra";
import { classificarErroMeta } from "./erros";
import { JANELA_MS, estadoDaJanela, rotuloDaJanela } from "./janela";
import { corpoDaMensagem, extrairEventos } from "./payload";
import { pedeParaParar } from "./optout";

const envelope = (campo: string, valor: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", time: 1, changes: [{ field: campo, value: valor }] }],
});
const meta = { display_phone_number: "5527999990000", phone_number_id: "PNID" };

describe("verificarAssinaturaMeta", () => {
  const corpo = '{"a":1}';
  const assinar = (c: string, s: string) =>
    `sha256=${createHmac("sha256", s).update(c).digest("hex")}`;

  it("aceita a assinatura correta", () => {
    expect(verificarAssinaturaMeta(corpo, assinar(corpo, "seg"), "seg")).toBe(true);
  });
  it("recusa corpo alterado, segredo errado, sem cabeçalho e esquema errado", () => {
    expect(verificarAssinaturaMeta('{"a":2}', assinar(corpo, "seg"), "seg")).toBe(false);
    expect(verificarAssinaturaMeta(corpo, assinar(corpo, "outro"), "seg")).toBe(false);
    expect(verificarAssinaturaMeta(corpo, null, "seg")).toBe(false);
    expect(verificarAssinaturaMeta(corpo, `sha1=${"0".repeat(40)}`, "seg")).toBe(false);
  });
  it("segredo vazio nunca confere — nem com assinatura calculada com ele", () => {
    expect(verificarAssinaturaMeta(corpo, assinar(corpo, ""), "")).toBe(false);
    expect(verificarAssinaturaMeta(corpo, assinar(corpo, ""), undefined)).toBe(false);
  });
});

describe("segredosDoApp (mais de um app no mesmo webhook)", () => {
  const corpo = '{"a":1}';
  const assinarCom = (segredo: string) =>
    `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`;
  const confere = (segredos: string[], assinadoCom: string) =>
    segredos.some((s) => verificarAssinaturaMeta(corpo, assinarCom(assinadoCom), s));

  it("junta o principal e os extras, sem vazios nem espaços", () => {
    expect(segredosDoApp({ META_APP_SECRET: "a", META_APP_SECRET_EXTRA: " b , ,c" })).toEqual(["a", "b", "c"]);
    expect(segredosDoApp({ META_APP_SECRET: "a" })).toEqual(["a"]);
    expect(segredosDoApp({})).toEqual([]);
    expect(segredosDoApp({ META_APP_SECRET: "", META_APP_SECRET_EXTRA: "" })).toEqual([]);
  });
  it("aceita o aviso assinado por qualquer um dos apps e recusa o de um terceiro", () => {
    const segredos = segredosDoApp({ META_APP_SECRET: "antigo", META_APP_SECRET_EXTRA: "novo" });
    expect(confere(segredos, "antigo")).toBe(true);
    expect(confere(segredos, "novo")).toBe(true);
    expect(confere(segredos, "intruso")).toBe(false);
  });
});

describe("cifra de token", () => {
  const chave = randomBytes(32).toString("base64");
  it("vai e volta", () => {
    const c = cifrarToken("EAAG-token-secreto", chave);
    expect(c).not.toContain("EAAG");
    expect(decifrarToken(c, chave)).toBe("EAAG-token-secreto");
  });
  it("cada cifra é diferente (IV novo)", () => {
    expect(cifrarToken("x", chave)).not.toBe(cifrarToken("x", chave));
  });
  it("adulterado ou chave errada falha, não devolve lixo", () => {
    const c = cifrarToken("segredo", chave);
    const partes = c.split(".");
    partes[3] = Buffer.from("adulterado").toString("base64url");
    expect(() => decifrarToken(partes.join("."), chave)).toThrow();
    expect(() => decifrarToken(c, randomBytes(32).toString("base64"))).toThrow();
  });
  it("sem chave válida FALHA FECHADO", () => {
    expect(() => cifrarToken("x", "")).toThrow(/WA_TOKEN_KEY/);
    expect(() => cifrarToken("x", Buffer.from("curta").toString("base64"))).toThrow(/WA_TOKEN_KEY/);
  });
});

describe("janela de 24h", () => {
  const t0 = new Date("2026-10-15T10:00:00Z");
  it("aberta logo depois da mensagem do cliente", () => {
    const e = estadoDaJanela(t0, new Date(t0.getTime() + 60_000));
    expect(e.aberta).toBe(true);
    expect(e.restanteMs).toBe(JANELA_MS - 60_000);
  });
  it("fecha exatamente em 24h", () => {
    expect(estadoDaJanela(t0, new Date(t0.getTime() + JANELA_MS)).aberta).toBe(false);
    expect(estadoDaJanela(t0, new Date(t0.getTime() + JANELA_MS - 1)).aberta).toBe(true);
  });
  it("sem mensagem do cliente (ou data inválida) está fechada", () => {
    expect(estadoDaJanela(null).aberta).toBe(false);
    expect(estadoDaJanela("lixo").aberta).toBe(false);
  });
  it("rótulo", () => {
    expect(rotuloDaJanela(3 * 3_600_000 + 12 * 60_000)).toBe("3h12");
    expect(rotuloDaJanela(5 * 3_600_000)).toBe("5h");
    expect(rotuloDaJanela(47 * 60_000)).toBe("47 min");
    expect(rotuloDaJanela(0)).toBe("fechada");
  });
});

describe("classificarErroMeta", () => {
  it("o que NÃO se retenta", () => {
    for (const c of [131047, 131030, 131050, 132012])
      expect(classificarErroMeta(c).retentavel).toBe(false);
  });
  it("o que se retenta", () => {
    expect(classificarErroMeta(130429).retentavel).toBe(true);
    expect(classificarErroMeta(131056).retentavel).toBe(true);
    expect(classificarErroMeta(null, 503).retentavel).toBe(true);
  });
  it("classes", () => {
    expect(classificarErroMeta(131047).classe).toBe("fora_da_janela");
    expect(classificarErroMeta(190).classe).toBe("autenticacao");
    expect(classificarErroMeta(999).classe).toBe("desconhecido");
  });
});

describe("extrairEventos", () => {
  it("texto com nome do perfil", () => {
    const ev = extrairEventos(
      envelope("messages", {
        metadata: meta,
        contacts: [{ profile: { name: "Ana" }, wa_id: "5527996318075" }],
        messages: [
          {
            from: "5527996318075",
            id: "wamid.1",
            timestamp: "1683229471",
            type: "text",
            text: { body: "Olá" },
          },
        ],
      }),
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "message",
      phoneNumberId: "PNID",
      waId: "5527996318075",
      profileName: "Ana",
      wamid: "wamid.1",
      body: "Olá",
      dedupKey: "msg:wamid.1",
      referral: null,
    });
  });

  it("referral de anúncio vem junto", () => {
    const ev = extrairEventos(
      envelope("messages", {
        metadata: meta,
        messages: [
          {
            from: "5527996318075",
            id: "wamid.2",
            timestamp: "1683229471",
            type: "text",
            text: { body: "oi" },
            referral: { ctwa_clid: "CLID", source_id: "AD", source_type: "ad", headline: "Promo" },
          },
        ],
      }),
    );
    expect(ev[0]).toMatchObject({
      kind: "message",
      referral: { ctwa_clid: "CLID", source_id: "AD" },
    });
  });

  it("resposta a botão, lista e reação têm corpo legível", () => {
    expect(
      corpoDaMensagem({
        type: "interactive",
        interactive: { button_reply: { id: "1", title: "Quero" } },
      }),
    ).toBe("Quero");
    expect(
      corpoDaMensagem({
        type: "interactive",
        interactive: { list_reply: { id: "1", title: "Plano B" } },
      }),
    ).toBe("Plano B");
    expect(corpoDaMensagem({ type: "button", button: { text: "Sim", payload: "x" } })).toBe("Sim");
    expect(corpoDaMensagem({ type: "image", image: { id: "m", caption: "foto" } })).toBe("foto");
    expect(corpoDaMensagem({ type: "reaction", reaction: { emoji: "👍" } })).toBe("👍");
    expect(corpoDaMensagem({ type: "audio", audio: { id: "m" } })).toBeNull();
  });

  it("status: entregue com preço, falha com erro", () => {
    const ev = extrairEventos(
      envelope("messages", {
        metadata: meta,
        statuses: [
          {
            id: "wamid.9",
            status: "delivered",
            timestamp: "1683229500",
            recipient_id: "5527996318075",
            pricing: { billable: true, category: "marketing", pricing_model: "CBP" },
          },
          {
            id: "wamid.8",
            status: "failed",
            timestamp: "1683229501",
            errors: [
              { code: 131047, title: "Re-engagement message", error_data: { details: "janela" } },
            ],
          },
        ],
      }),
    );
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({
      kind: "status",
      status: "delivered",
      pricing: { category: "marketing" },
    });
    expect(ev[1]).toMatchObject({
      kind: "status",
      status: "failed",
      error: { code: 131047, title: "Re-engagement message", details: "janela" },
    });
  });

  it("status desconhecido é descartado, não vira erro", () => {
    const ev = extrairEventos(
      envelope("messages", {
        metadata: meta,
        statuses: [{ id: "w", status: "deleted", timestamp: "1" }],
      }),
    );
    expect(ev).toEqual([]);
  });

  it("eco do app (coexistência)", () => {
    const ev = extrairEventos(
      envelope("smb_message_echoes", {
        metadata: meta,
        message_echoes: [
          {
            from: "5527999990000",
            to: "5527996318075",
            id: "wamid.E",
            timestamp: "1683229600",
            type: "text",
            text: { body: "Oi, Ana" },
          },
        ],
      }),
    );
    expect(ev[0]).toMatchObject({
      kind: "echo",
      waId: "5527996318075",
      wamid: "wamid.E",
      body: "Oi, Ana",
    });
  });

  it("histórico: separa o que foi do negócio", () => {
    const ev = extrairEventos(
      envelope("history", {
        metadata: meta,
        history: [
          {
            metadata: { phase: 0, chunk_order: 1, progress: 55 },
            threads: [
              {
                id: "5527996318075",
                messages: [
                  {
                    from: "5527996318075",
                    to: "5527999990000",
                    id: "h1",
                    timestamp: "1683000000",
                    type: "text",
                    text: { body: "oi" },
                  },
                  {
                    from: "5527999990000",
                    to: "5527996318075",
                    id: "h2",
                    timestamp: "1683000100",
                    type: "text",
                    text: { body: "olá" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const msgs = ev.filter((e) => e.kind === "history_message");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ doNegocio: false });
    expect(msgs[1]).toMatchObject({ doNegocio: true });
    // e o bloco também informa o progresso da sincronização
    expect(ev.filter((e) => e.kind === "historico_progresso")).toHaveLength(1);
  });

  it("campo desconhecido vira 'ignorado'; lixo não lança", () => {
    expect(
      extrairEventos(envelope("phone_number_quality_update", { event: "FLAGGED" }))[0].kind,
    ).toBe("ignorado");
    expect(extrairEventos(null)).toEqual([]);
    expect(extrairEventos({ object: "page" })).toEqual([]);
    expect(extrairEventos({ object: "whatsapp_business_account", entry: "x" })).toEqual([]);
  });

  it("mensagem sem id ou sem número de origem é descartada", () => {
    const ev = extrairEventos(
      envelope("messages", {
        metadata: meta,
        messages: [
          { from: "55", type: "text" },
          { id: "x", type: "text" },
        ],
      }),
    );
    expect(ev).toEqual([]);
  });
});

describe("pedeParaParar", () => {
  it.each(["SAIR", "  parar", "Stop", "cancelar por favor", "descadastrar"])("%s", (t) => {
    expect(pedeParaParar(t)).toBe(true);
  });
  it.each(["SAIR!", "Parar.", "stop ", "pare por favor"])(
    "%s também (pontuação e cortesia)",
    (t) => {
      expect(pedeParaParar(t)).toBe(true);
    },
  );
  it.each([
    "cancelar meu pedido",
    "sair às 18h",
    "remover o item 3",
    "parar de receber? não, continuo",
    "quero cancelar o plano",
  ])("%s é CONVERSA, não pedido de parada", (t) => {
    expect(pedeParaParar(t)).toBe(false);
  });
  it.each(["quero saber mais", "não quero parar", "", null])("%s não", (t) => {
    expect(pedeParaParar(t as string | null)).toBe(false);
  });
});

// Evita que o ambiente de teste vaze chave real
beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("eventos da Fase 2", () => {
  it("template aprovado/rejeitado", () => {
    const ev = extrairEventos({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          time: 1700000000,
          changes: [
            {
              field: "message_template_status_update",
              value: {
                event: "REJECTED",
                message_template_id: 123,
                message_template_name: "boas_vindas",
                message_template_language: "pt_BR",
                reason: "INVALID_FORMAT",
              },
            },
          ],
        },
      ],
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "template_status",
      wabaId: "WABA",
      name: "boas_vindas",
      language: "pt_BR",
      status: "REJECTED",
      reason: "INVALID_FORMAT",
      providerTemplateId: "123",
    });
  });

  it("account_update: desconexão e reconexão", () => {
    const ev = extrairEventos({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          time: 1,
          changes: [
            {
              field: "account_update",
              value: {
                phone_number: "5527999990000",
                event: "PARTNER_REMOVED",
                disconnection_info: { reason: "app_uninstalled", initiated_by: "business" },
              },
            },
          ],
        },
        {
          id: "WABA",
          time: 2,
          changes: [{ field: "account_update", value: { event: "ACCOUNT_RECONNECTED" } }],
        },
      ],
    });
    expect(ev[0]).toMatchObject({
      kind: "conta",
      evento: "PARTNER_REMOVED",
      displayPhone: "5527999990000",
      motivo: "app_uninstalled",
    });
    expect(ev[1]).toMatchObject({
      kind: "conta",
      evento: "ACCOUNT_RECONNECTED",
      displayPhone: null,
    });
  });

  it("progresso do histórico vira evento próprio", () => {
    const ev = extrairEventos({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "W",
          changes: [
            {
              field: "history",
              value: {
                metadata: { display_phone_number: "5527999990000", phone_number_id: "PNID" },
                history: [{ metadata: { phase: 1, chunk_order: 3, progress: 80 }, threads: [] }],
              },
            },
          ],
        },
      ],
    });
    expect(ev).toEqual([
      expect.objectContaining({
        kind: "historico_progresso",
        phoneNumberId: "PNID",
        progress: 80,
        phase: 1,
      }),
    ]);
  });
});
