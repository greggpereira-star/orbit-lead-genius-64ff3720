// @vitest-environment node
/**
 * Ensaio contra a META FALSA (scripts/ensaio-local/meta-falsa.mjs): o código REAL
 * de HTTP (graph.ts e cloud-provider.ts) conversa por um socket de verdade com um
 * servidor que imita a Graph API. Prova que montamos as requisições como a
 * documentação manda e que tratamos as respostas e os erros; NÃO prova que a Meta
 * se comporta assim — isso continua [VERIFICAR] até o número de teste.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { criarMetaFalsa } from "../../../../scripts/ensaio-local/meta-falsa.mjs";

const meta = criarMetaFalsa();
const CHAVE = randomBytes(32).toString("base64");
let graph: typeof import("./graph");
let provedor: ReturnType<typeof import("./cloud-provider").criarCloudProvider>;

/** Banco mínimo: o provedor só lê o número e a credencial cifrada. */
function dbComToken(token: string, cifrar: (t: string, k: string) => string) {
  const por: Record<string, unknown> = {
    wa_phone_numbers: { account_id: "conta-1" },
    wa_credentials: { access_token_enc: cifrar(token, CHAVE) },
  };
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: por[t] ?? null, error: null }) }),
      }),
    }),
  };
}

beforeAll(async () => {
  const base = await meta.iniciar();
  process.env.META_GRAPH_BASE_URL = `${base}/v25.0`;
  process.env.WA_TOKEN_KEY = CHAVE;
  vi.resetModules();
  graph = await import("./graph");
  const { cifrarToken } = await import("./cifra");
  const { criarCloudProvider } = await import("./cloud-provider");
  provedor = criarCloudProvider(dbComToken("TOKEN_OK", cifrarToken) as never);
});
afterAll(async () => {
  delete process.env.META_GRAPH_BASE_URL;
  await meta.parar();
});

describe("leitura do número", () => {
  it("lê os campos completos e manda o token por Authorization (nunca na URL)", async () => {
    const r = await graph.lerNumero("PNID_TESTE", "TOKEN_OK");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.quality_rating).toBe("GREEN");
      expect(r.data.messaging_limit_tier).toBe("TIER_1K");
    }
    const c = meta.chamadas.at(-1)!;
    expect(c.token).toBe("<presente>");
    expect(JSON.stringify(c.query)).not.toMatch(/TOKEN_OK|access_token/);
  });

  it("token expirado vira erro de autenticação (reconectar), sem retentar", async () => {
    const r = await graph.lerNumero("PNID_TESTE", "TOKEN_EXPIRADO");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.classe).toBe("autenticacao");
      expect(r.erro.retentavel).toBe(false);
      expect(r.erro.codigo).toBe(190);
    }
  });

  it("número inexistente devolve erro 100, não explode", async () => {
    const r = await graph.lerNumero("NAO_EXISTE", "TOKEN_OK");
    expect(r.ok).toBe(false);
  });
});

describe("templates", () => {
  it("cria, lista pendente, vê a aprovação e apaga", async () => {
    const def = {
      name: "boas_vindas",
      language: "pt_BR",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Olá {{1}}" }],
    };
    const criado = await graph.criarTemplateNaMeta("WABA1", "TOKEN_OK", def);
    expect(criado.ok).toBe(true);
    if (criado.ok) expect(criado.data.status).toBe("PENDING");

    let lista = await graph.listarTemplatesDaWaba("WABA1", "TOKEN_OK");
    expect(lista.ok && lista.data.map((t) => `${t.name}:${t.status}`)).toEqual([
      "boas_vindas:PENDING",
    ]);

    meta.aprovarTemplate("WABA1", "boas_vindas");
    lista = await graph.listarTemplatesDaWaba("WABA1", "TOKEN_OK");
    expect(lista.ok && lista.data[0].status).toBe("APPROVED");

    const ap = await graph.apagarTemplateNaMeta("WABA1", "TOKEN_OK", "boas_vindas");
    expect(ap.ok).toBe(true);
    lista = await graph.listarTemplatesDaWaba("WABA1", "TOKEN_OK");
    expect(lista.ok && lista.data).toEqual([]);
  });

  it("nome de template inválido volta como erro da Meta, com a mensagem", async () => {
    const r = await graph.criarTemplateNaMeta("WABA1", "TOKEN_OK", {
      name: "Nome Inválido",
      language: "pt_BR",
      category: "UTILITY",
      components: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toMatch(/Invalid template name/);
  });
});

describe("conexão da conta", () => {
  it("troca o código por token e inscreve o app na WABA com callback próprio", async () => {
    const t = await graph.trocarCodigoPorToken({
      appId: "APP",
      appSecret: "SEGREDO",
      code: "CODIGO",
    });
    expect(t.ok && t.data.access_token).toMatch(/^TOKEN_DA_EMPRESA_/);
    const sem = await graph.trocarCodigoPorToken({ appId: "APP", appSecret: "SEGREDO", code: "" });
    expect(sem.ok).toBe(false);

    const i = await graph.inscreverAppNaWaba("WABA1", "TOKEN_OK", {
      url: "https://altleadflow.example/api/public/wa-webhook",
      verifyToken: "VT",
    });
    expect(i.ok).toBe(true);
    const c = meta.chamadas.filter((x) => x.caminho.endsWith("/subscribed_apps")).at(-1)!;
    expect(c.corpo).toEqual({
      override_callback_uri: "https://altleadflow.example/api/public/wa-webhook",
      verify_token: "VT",
    });
  });
});

describe("envio (provedor Cloud)", () => {
  const canal = { provider: "cloud" as const, referencia: "PNID_TESTE" };

  it("texto: monta o corpo da documentação e devolve o wamid", async () => {
    const r = await provedor.sendText(canal, "5527999990001", "Olá!");
    expect(r.ok).toBe(true);
    expect(r.data?.messageId).toMatch(/^wamid\./);
    const c = meta.chamadas.filter((x) => x.caminho.endsWith("/messages")).at(-1)!;
    expect(c.corpo).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5527999990001",
      type: "text",
      text: { body: "Olá!", preview_url: false },
    });
  });

  it("template: nome, idioma e componentes seguem para a Meta", async () => {
    const r = await provedor.sendTemplate(canal, "5527999990001", "boas_vindas", "pt_BR", [
      { type: "body", parameters: [{ type: "text", text: "Ana" }] },
    ]);
    expect(r.ok).toBe(true);
    const c = meta.chamadas.filter((x) => x.caminho.endsWith("/messages")).at(-1)!;
    expect(c.corpo).toMatchObject({
      type: "template",
      template: { name: "boas_vindas", language: { code: "pt_BR" } },
    });
  });

  it("mídia: áudio não leva legenda; documento leva nome de arquivo", async () => {
    await provedor.sendMedia(canal, "5527999990001", {
      tipo: "audio",
      link: "https://x/a.ogg",
      legenda: "não deve ir",
    });
    let c = meta.chamadas.filter((x) => x.caminho.endsWith("/messages")).at(-1)!;
    expect((c.corpo.audio as Record<string, unknown>).caption).toBeUndefined();
    await provedor.sendMedia(canal, "5527999990001", {
      tipo: "document",
      link: "https://x/d.pdf",
      legenda: "Proposta",
      nomeDoArquivo: "proposta.pdf",
    });
    c = meta.chamadas.filter((x) => x.caminho.endsWith("/messages")).at(-1)!;
    expect(c.corpo.document).toMatchObject({ caption: "Proposta", filename: "proposta.pdf" });
  });

  it.each([
    ["5527999990047", "fora_da_janela", false],
    ["5527999990030", "numero_nao_whatsapp", false],
    ["5527999990050", "optout_de_marketing", false],
    ["5527999990429", "limite_de_taxa", true],
    ["5527999990500", "temporario", true],
  ])(
    "erro da Meta para %s é classificado como %s (retentável: %s)",
    async (para, classe, retentavel) => {
      const r = (await provedor.sendText(
        canal,
        para,
        "oi",
      )) as import("./cloud-provider").ResultadoCloud;
      expect(r.ok).toBe(false);
      expect(r.erroMeta?.classe).toBe(classe);
      expect(r.erroMeta?.retentavel).toBe(retentavel);
    },
  );

  it("o token nunca aparece no retorno de erro", async () => {
    const r = await provedor.sendText(canal, "5527999990047", "oi");
    expect(JSON.stringify(r)).not.toMatch(/TOKEN_OK/);
  });
});

describe("desvio do endereço da Graph API", () => {
  it("só aceita localhost: host externo é ignorado e o token não vai para lá", async () => {
    const { baseDaGraph } = await import("../../meta-graph.server");
    expect(baseDaGraph({ META_GRAPH_BASE_URL: "https://evil.example/v25.0" })).toBe(
      "https://graph.facebook.com/v25.0",
    );
    expect(baseDaGraph({ META_GRAPH_BASE_URL: "http://127.0.0.1:9911/v25.0/" })).toBe(
      "http://127.0.0.1:9911/v25.0",
    );
    expect(baseDaGraph({})).toBe("https://graph.facebook.com/v25.0");
    expect(baseDaGraph({ META_GRAPH_BASE_URL: "javascript:alert(1)" })).toBe(
      "https://graph.facebook.com/v25.0",
    );
  });
});
