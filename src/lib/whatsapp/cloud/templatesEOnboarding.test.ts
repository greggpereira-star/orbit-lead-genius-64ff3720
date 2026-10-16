import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decifrarToken } from "./cifra";
import { criarDb, rotearFetch } from "./dbFalso";
import { lerNumero, listarTemplatesDaWaba } from "./graph";
import {
  apagarTemplate,
  concluirComToken,
  concluirOnboarding,
  criarTemplate,
  sincronizarTemplates,
} from "./onboarding";
import {
  montarComponentes,
  parametrosDoCorpo,
  temErro,
  validarTemplate,
  variaveisDe,
  type DefinicaoDeTemplate,
} from "./templates";
import { cifrarToken } from "./cifra";

const boa: DefinicaoDeTemplate = {
  nome: "boas_vindas_v1",
  idioma: "pt_BR",
  categoria: "UTILITY",
  cabecalho: "Seu pedido",
  corpo: "Olá {{1}}, recebemos o pedido {{2}}. Qualquer dúvida é só responder.",
  rodape: "Alt Flow",
  exemplosDoCorpo: ["Ana", "12345"],
  botoes: [
    { tipo: "QUICK_REPLY", texto: "Ok" },
    { tipo: "URL", texto: "Acompanhar", valor: "https://exemplo.com.br/p/{{1}}" },
  ],
};

describe("validarTemplate", () => {
  it("um template correto não tem erro", () => {
    expect(temErro(validarTemplate(boa))).toBe(false);
  });

  it.each([
    ["nome com maiúscula", { nome: "BoasVindas" }, "nome"],
    ["nome com espaço", { nome: "boas vindas" }, "nome"],
    ["idioma inválido", { idioma: "portugues" }, "idioma"],
    ["corpo vazio", { corpo: "  ", exemplosDoCorpo: [] }, "corpo"],
    [
      "variável pulando número",
      { corpo: "Oi {{1}} e {{3}} tudo bem?", exemplosDoCorpo: ["a", "b"] },
      "corpo",
    ],
    ["sem exemplo das variáveis", { exemplosDoCorpo: [] }, "exemplos"],
    ["emoji no cabeçalho", { cabecalho: "Pedido 🎉" }, "cabecalho"],
    ["cabeçalho > 60", { cabecalho: "x".repeat(61) }, "cabecalho"],
    ["variável no rodapé", { rodape: "Código {{1}}" }, "rodape"],
    ["corpo > 1024", { corpo: "a".repeat(1025), exemplosDoCorpo: [] }, "corpo"],
  ] as const)("recusa: %s", (_nome, alt, campo) => {
    const p = validarTemplate({ ...boa, ...alt } as DefinicaoDeTemplate);
    expect(p.some((x) => x.gravidade === "erro" && x.campo === campo)).toBe(true);
  });

  it("botão: URL sem https, telefone sem +DDI, texto longo, mais de 10", () => {
    const base = { ...boa, botoes: [] };
    expect(
      temErro(
        validarTemplate({
          ...base,
          botoes: [{ tipo: "URL", texto: "Ver", valor: "http://x.com" }],
        }),
      ),
    ).toBe(true);
    expect(
      temErro(
        validarTemplate({
          ...base,
          botoes: [{ tipo: "URL", texto: "Ver", valor: "myapp://abrir" }],
        }),
      ),
    ).toBe(true);
    expect(
      temErro(
        validarTemplate({
          ...base,
          botoes: [{ tipo: "PHONE_NUMBER", texto: "Ligar", valor: "27999990000" }],
        }),
      ),
    ).toBe(true);
    expect(
      temErro(
        validarTemplate({ ...base, botoes: [{ tipo: "QUICK_REPLY", texto: "x".repeat(26) }] }),
      ),
    ).toBe(true);
    const onze = Array.from({ length: 11 }, (_, i) => ({
      tipo: "QUICK_REPLY" as const,
      texto: `b${i}`,
    }));
    expect(temErro(validarTemplate({ ...base, botoes: onze }))).toBe(true);
  });

  it("corpo começando com variável é AVISO, não erro", () => {
    const p = validarTemplate({
      ...boa,
      corpo: "{{1}}, seu pedido {{2}} saiu.",
      exemplosDoCorpo: ["Ana", "1"],
    });
    expect(p.some((x) => x.gravidade === "aviso" && x.campo === "corpo")).toBe(true);
    expect(temErro(p)).toBe(false);
  });
});

describe("montarComponentes / parametrosDoCorpo / variaveisDe", () => {
  it("monta cabeçalho, corpo com exemplos, rodapé e botões", () => {
    const c = montarComponentes(boa) as Array<Record<string, unknown>>;
    expect(c.map((x) => x.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect(c[1]).toMatchObject({ text: boa.corpo, example: { body_text: [["Ana", "12345"]] } });
    const botoes = (c[3] as { buttons: Array<Record<string, unknown>> }).buttons;
    expect(botoes[1]).toMatchObject({
      type: "URL",
      url: "https://exemplo.com.br/p/{{1}}",
      example: ["https://exemplo.com.br/p/exemplo"],
    });
  });

  it("sem variável não manda `example`", () => {
    const c = montarComponentes({
      ...boa,
      corpo: "Olá!",
      exemplosDoCorpo: [],
      cabecalho: undefined,
      botoes: [],
    }) as Array<Record<string, unknown>>;
    expect(c[0]).toEqual({ type: "BODY", text: "Olá!" });
  });

  it("parâmetros na ordem; falta de valor é detectada", () => {
    expect(parametrosDoCorpo("Oi {{1}} {{2}}", { 1: "Ana", 2: "X" })).toEqual({
      ok: true,
      parametros: [
        { type: "text", text: "Ana" },
        { type: "text", text: "X" },
      ],
    });
    expect(parametrosDoCorpo("Oi {{1}} {{2}}", { 1: "Ana" })).toEqual({ ok: false, faltando: [2] });
  });

  it("variaveisDe", () => {
    expect(variaveisDe("a {{1}} b {{ 2 }} c {{1}}")).toEqual([1, 2, 1]);
  });
});

describe("graph", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lerNumero: se um campo não existe (erro 100), tenta o conjunto mínimo", async () => {
    const { f, chamadas } = rotearFetch({
      "/PNID": [
        {
          status: 400,
          corpo: { error: { code: 100, message: "Tried accessing nonexisting field (x)" } },
        },
        { corpo: { id: "PNID", display_phone_number: "+55 27 99999-0000", verified_name: "Loja" } },
      ],
    });
    vi.stubGlobal("fetch", f);
    const r = await lerNumero("PNID", "TOK");
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].url).toContain("is_on_biz_app");
    expect(chamadas[1].url).not.toContain("is_on_biz_app");
  });

  it("lerNumero: outro erro não é retentado com campos mínimos", async () => {
    const { f, chamadas } = rotearFetch({
      "/PNID": { status: 401, corpo: { error: { code: 190, message: "expirou" } } },
    });
    vi.stubGlobal("fetch", f);
    const r = await lerNumero("PNID", "TOK");
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(1);
    if (!r.ok) expect(r.erro.classe).toBe("autenticacao");
  });

  it("listarTemplates pagina e junta", async () => {
    const { f } = rotearFetch({
      "/WABA/message_templates": [
        {
          corpo: {
            data: [{ name: "a", language: "pt_BR", category: "UTILITY", status: "APPROVED" }],
            paging: { cursors: { after: "P2" }, next: "x" },
          },
        },
        {
          corpo: {
            data: [{ name: "b", language: "pt_BR", category: "MARKETING", status: "PENDING" }],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", f);
    const r = await listarTemplatesDaWaba("WABA", "TOK");
    expect(r.ok && r.data.map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("paginação cíclica tem teto (não prende o servidor)", async () => {
    const { f, chamadas } = rotearFetch({
      "/WABA/message_templates": {
        corpo: { data: [], paging: { cursors: { after: "SEMPRE" }, next: "x" } },
      },
    });
    vi.stubGlobal("fetch", f);
    await listarTemplatesDaWaba("WABA", "TOK");
    expect(chamadas.length).toBeLessThanOrEqual(20);
  });
});

describe("concluirOnboarding", () => {
  const chave = randomBytes(32).toString("base64");
  const base = {
    appId: "APP",
    appSecret: "SEC",
    companyId: "emp1",
    userId: "u1",
    code: "COD",
    wabaId: "WABA",
    phoneNumberId: "PNID",
  };

  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    vi.stubEnv("WA_WEBHOOK_VERIFY_TOKEN", "VERIFY-TESTE");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const feliz = (coexistencia: boolean) => ({
    "/oauth/access_token": { corpo: { access_token: "TOKEN-DA-EMPRESA" } },
    "/PNID/smb_app_data": { corpo: { messaging_product: "whatsapp", request_id: "R" } },
    "/PNID": {
      corpo: {
        id: "PNID",
        display_phone_number: "+55 27 99999-0000",
        verified_name: "Loja",
        quality_rating: "GREEN",
        messaging_limit_tier: "TIER_1K",
        is_on_biz_app: coexistencia,
      },
    },
    "/WABA/subscribed_apps": { corpo: { success: true } },
  });

  it("coexistência: grava conta/número/credencial CIFRADA e pede histórico e contatos", async () => {
    const { f, chamadas } = rotearFetch(feliz(true));
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: { wa_accounts: { id: "acc1" } } });

    const r = await concluirOnboarding(db, base);
    expect(r).toMatchObject({
      ok: true,
      numero: { modo: "coexistence", displayPhone: "5527999990000" },
      sincronizacao: { historico: true, contatos: true },
    });
    expect(chamadas.filter((c) => c.url.includes("/smb_app_data"))).toHaveLength(2);

    const cred = ops.find((o) => o.tabela === "wa_credentials" && o.op === "upsert")!;
    const gravado = (cred.args[0] as { access_token_enc: string }).access_token_enc;
    expect(gravado).not.toContain("TOKEN-DA-EMPRESA");
    expect(decifrarToken(gravado)).toBe("TOKEN-DA-EMPRESA");

    const num = ops.find((o) => o.tabela === "wa_phone_numbers" && o.op === "upsert")!;
    expect(num.args[0]).toMatchObject({
      company_id: "emp1",
      mode: "coexistence",
      is_on_biz_app: true,
      quality: "GREEN",
    });
    expect((num.args[0] as { webhook_subscribed_at: string }).webhook_subscribed_at).toBeTruthy();
  });

  it("inscreve a WABA com callback PRÓPRIO, sem mexer no callback do app", async () => {
    const { f, chamadas } = rotearFetch(feliz(true));
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: { wa_accounts: { id: "acc1" } } });
    await concluirOnboarding(db, base);
    const insc = chamadas.find((c) => c.url.includes("/WABA/subscribed_apps"))!;
    expect(JSON.parse(String(insc.init.body))).toEqual({
      override_callback_uri: "https://altleadflow.com.br/api/public/wa-webhook",
      verify_token: "VERIFY-TESTE",
    });
  });

  it("sem WA_WEBHOOK_VERIFY_TOKEN não inscreve (cairia no callback de outro sistema)", async () => {
    vi.stubEnv("WA_WEBHOOK_VERIFY_TOKEN", "");
    const { f, chamadas } = rotearFetch(feliz(true));
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({});
    expect(await concluirOnboarding(db, base)).toMatchObject({ ok: false, etapa: "inscricao" });
    expect(chamadas.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
    expect(ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("número só da API: não pede sincronização", async () => {
    const { f, chamadas } = rotearFetch(feliz(false));
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: { wa_accounts: { id: "acc1" } } });
    const r = await concluirOnboarding(db, base);
    expect(r).toMatchObject({ ok: true, numero: { modo: "cloud_only" } });
    expect(chamadas.some((c) => c.url.includes("/smb_app_data"))).toBe(false);
  });

  it("número de OUTRA empresa é recusado, sem inscrever nem gravar", async () => {
    const { f, chamadas } = rotearFetch(feliz(true));
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: { wa_phone_numbers: { company_id: "OUTRA" } } });
    const r = await concluirOnboarding(db, base);
    expect(r).toMatchObject({ ok: false, etapa: "posse" });
    expect(chamadas.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
    expect(ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("código recusado pela Meta: etapa 'troca', nada gravado", async () => {
    const { f } = rotearFetch({
      "/oauth/access_token": {
        status: 400,
        corpo: { error: { code: 100, message: "code expirado" } },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({});
    const r = await concluirOnboarding(db, base);
    expect(r).toMatchObject({ ok: false, etapa: "troca" });
    expect(ops).toEqual([]);
  });

  it("falha na inscrição do webhook: etapa 'inscricao', nada gravado", async () => {
    const rotas = feliz(true);
    rotas["/WABA/subscribed_apps"] = {
      status: 400,
      corpo: { error: { code: 200, message: "sem permissão" } },
    } as never;
    const { f } = rotearFetch(rotas);
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({});
    const r = await concluirOnboarding(db, base);
    expect(r).toMatchObject({ ok: false, etapa: "inscricao" });
    expect(ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("o token não aparece em nenhum retorno", async () => {
    const { f } = rotearFetch(feliz(true));
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: { wa_accounts: { id: "acc1" } } });
    expect(JSON.stringify(await concluirOnboarding(db, base))).not.toContain("TOKEN-DA-EMPRESA");
  });
});

describe("templates (serviço)", () => {
  const chave = randomBytes(32).toString("base64");
  beforeEach(() => vi.stubEnv("WA_TOKEN_KEY", chave));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const tabelas = () => ({
    wa_accounts: { id: "acc1", waba_id: "WABA" },
    wa_credentials: { access_token_enc: cifrarToken("TOK") },
  });

  it("criar: definição inválida NÃO chama a Meta", async () => {
    const { f } = rotearFetch({});
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: tabelas() });
    const r = await criarTemplate(db, {
      companyId: "emp",
      userId: "u",
      definicao: { ...boa, nome: "Inválido" },
    });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
    if (!r.ok) expect(r.problemas?.some((p) => p.campo === "nome")).toBe(true);
  });

  it("criar: envia à Meta e guarda como PENDING", async () => {
    const { f, chamadas } = rotearFetch({
      "/WABA/message_templates": { corpo: { id: "999", status: "PENDING", category: "UTILITY" } },
    });
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: tabelas() });
    const r = await criarTemplate(db, { companyId: "emp", userId: "u", definicao: boa });
    expect(r).toMatchObject({ ok: true, status: "PENDING", providerTemplateId: "999" });
    const corpo = JSON.parse(String(chamadas[0].init.body));
    expect(corpo).toMatchObject({ name: "boas_vindas_v1", language: "pt_BR", category: "UTILITY" });
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
    const up = ops.find((o) => o.tabela === "wa_templates" && o.op === "upsert");
    expect(up?.args[0]).toMatchObject({
      name: "boas_vindas_v1",
      status: "PENDING",
      created_by: "u",
    });
  });

  it("criar: erro da Meta volta como texto, sem gravar", async () => {
    const { f } = rotearFetch({
      "/WABA/message_templates": {
        status: 400,
        corpo: { error: { code: 100, message: "Invalid parameter" } },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: tabelas() });
    const r = await criarTemplate(db, { companyId: "emp", userId: "u", definicao: boa });
    expect(r).toMatchObject({ ok: false, texto: "Invalid parameter" });
    expect(ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("sem conta conectada: mensagem clara", async () => {
    const { db } = criarDb({});
    expect(await sincronizarTemplates(db, "emp")).toEqual({
      ok: false,
      texto: "Conecte um número do WhatsApp primeiro.",
    });
  });

  it("sincronizar: grava o que a Meta devolve", async () => {
    const { f } = rotearFetch({
      "/WABA/message_templates": {
        corpo: {
          data: [
            {
              id: "1",
              name: "a",
              language: "pt_BR",
              category: "UTILITY",
              status: "approved",
              components: [],
              rejected_reason: "NONE",
            },
          ],
        },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: tabelas() });
    expect(await sincronizarTemplates(db, "emp")).toEqual({ ok: true, total: 1 });
    const linhas = ops.find((o) => o.tabela === "wa_templates" && o.op === "upsert")!
      .args[0] as Array<Record<string, unknown>>;
    expect(linhas[0]).toMatchObject({ name: "a", status: "APPROVED", rejection_reason: null });
  });

  it("apagar chama a Meta e depois remove localmente", async () => {
    const { f, chamadas } = rotearFetch({
      "/WABA/message_templates": { corpo: { success: true } },
    });
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: tabelas() });
    expect(await apagarTemplate(db, { companyId: "emp", nome: "a" })).toEqual({ ok: true });
    expect(chamadas[0].init.method).toBe("DELETE");
    expect(ops.some((o) => o.tabela === "wa_templates" && o.op === "delete")).toBe(true);
  });
});

describe("concluirComToken (conexão manual / número de teste)", () => {
  const chave = randomBytes(32).toString("base64");
  const base = { companyId: "emp1", wabaId: "WABA", phoneNumberId: "PNID", token: "TOKEN-COLADO" };
  const rotas = {
    "/PNID": {
      corpo: {
        id: "PNID",
        display_phone_number: "+1 555 665 9150",
        verified_name: "Test Number",
        quality_rating: "GREEN",
        is_on_biz_app: false,
      },
    },
    "/WABA/subscribed_apps": { corpo: { success: true } },
  };

  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    vi.stubEnv("WA_WEBHOOK_VERIFY_TOKEN", "VERIFY-TESTE");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("valida o número com o token, inscreve com callback próprio e grava o token CIFRADO", async () => {
    const { f, chamadas } = rotearFetch(rotas);
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({ tabelas: { wa_accounts: { id: "acc1" } } });

    const r = await concluirComToken(db, base);
    expect(r).toMatchObject({
      ok: true,
      numero: { modo: "cloud_only", displayPhone: "15556659150" },
    });

    const insc = chamadas.find((c) => c.url.includes("/WABA/subscribed_apps"))!;
    expect(JSON.parse(String(insc.init.body))).toMatchObject({ verify_token: "VERIFY-TESTE" });

    const cred = ops.find((o) => o.tabela === "wa_credentials" && o.op === "upsert")!;
    const gravado = (cred.args[0] as { access_token_enc: string }).access_token_enc;
    expect(gravado).not.toContain("TOKEN-COLADO");
    expect(decifrarToken(gravado)).toBe("TOKEN-COLADO");
    expect(JSON.stringify(r)).not.toContain("TOKEN-COLADO");
  });

  it("token que a Meta não aceita: nada é gravado", async () => {
    const { f } = rotearFetch({
      "/PNID": { status: 401, corpo: { error: { code: 190, message: "token inválido" } } },
    } as never);
    vi.stubGlobal("fetch", f);
    const { db, ops } = criarDb({});
    expect(await concluirComToken(db, base)).toMatchObject({ ok: false, etapa: "numero" });
    expect(ops.filter((o) => o.op === "upsert")).toEqual([]);
  });

  it("número de OUTRA empresa continua recusado (a posse vale também no caminho manual)", async () => {
    const { f, chamadas } = rotearFetch(rotas);
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: { wa_phone_numbers: { company_id: "OUTRA" } } });
    expect(await concluirComToken(db, base)).toMatchObject({ ok: false, etapa: "posse" });
    expect(chamadas.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
  });
});
