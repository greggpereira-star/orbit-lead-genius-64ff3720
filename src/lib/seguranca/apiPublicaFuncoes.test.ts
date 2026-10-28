import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const funcoes = readFileSync("src/lib/desenvolvedores.functions.ts", "utf8");
const leads = readFileSync("src/lib/apiPublica/leads.server.ts", "utf8");

const corpo = (src: string, nome: string) => {
  const i = src.indexOf(`export const ${nome}`);
  expect(i, `${nome} existe`).toBeGreaterThan(-1);
  const f = src.indexOf("\nexport ", i + 10);
  return src.slice(i, f === -1 ? undefined : f);
};

describe("gestão de chaves e webhooks (server functions)", () => {
  const gestao = [
    "criarChaveDeApi",
    "revogarChaveDeApi",
    "criarEndpointDeWebhook",
    "atualizarEndpointDeWebhook",
    "rotacionarSegredoDeWebhook",
    "removerEndpointDeWebhook",
    "enviarTesteDeWebhook",
    "entregasDoEndpoint",
  ];

  it("todas exigem dono/administrador ANTES de qualquer acesso a dados", () => {
    for (const nome of gestao) {
      const c = corpo(funcoes, nome);
      const idx = c.indexOf("await contexto(admin, context.userId)");
      expect(idx, `${nome} exige admin`).toBeGreaterThan(-1);
      const primeiroAcesso = Math.min(
        ...[".from(", ".insert(", ".update(", ".delete("].map((t) =>
          c.indexOf(t) === -1 ? Infinity : c.indexOf(t),
        ),
      );
      expect(idx, `${nome}: conferência antes do acesso`).toBeLessThan(primeiroAcesso);
    }
  });

  it("só a leitura do estado deixa membro comum entrar, e ela não devolve lista", () => {
    const c = corpo(funcoes, "estadoDeDesenvolvedor");
    expect(c).toContain("contexto(admin, context.userId, false)");
    expect(c).toMatch(/if \(!podeConfigurar\)[\s\S]*chaves: \[\], endpoints: \[\]/);
  });

  it("criar e religar conferem o PLANO antes de gravar", () => {
    for (const [nome, recurso] of [
      ["criarChaveDeApi", "api_publica"],
      ["criarEndpointDeWebhook", "webhooks_assinados"],
      ["enviarTesteDeWebhook", "webhooks_assinados"],
    ]) {
      const c = corpo(funcoes, nome);
      const a = c.indexOf(`exigirRecurso(admin, companyId, "${recurso}")`);
      expect(a, `${nome} confere o plano`).toBeGreaterThan(-1);
      const g = [c.indexOf(".insert("), c.indexOf("postarAssinado(")].filter((x) => x > -1);
      for (const x of g) expect(a).toBeLessThan(x);
    }
    expect(corpo(funcoes, "atualizarEndpointDeWebhook")).toContain(
      'exigirRecurso(admin, companyId, "webhooks_assinados")',
    );
  });

  it("toda alteração e remoção filtra pela empresa do usuário", () => {
    for (const nome of [
      "revogarChaveDeApi",
      "atualizarEndpointDeWebhook",
      "rotacionarSegredoDeWebhook",
      "removerEndpointDeWebhook",
    ]) {
      expect(corpo(funcoes, nome), `${nome} filtra por empresa`).toContain(
        '.eq("company_id", companyId)',
      );
    }
    expect(corpo(funcoes, "entregasDoEndpoint")).toContain('.eq("company_id", companyId)');
  });

  it("nunca seleciona hash nem segredo para devolver à tela", () => {
    const c = corpo(funcoes, "estadoDeDesenvolvedor");
    for (const select of c.match(/\.select\("[^"]*"\)/g) ?? []) {
      expect(select).not.toMatch(/\bhash\b|\bsegredo\b|\bpayload\b/);
    }
    expect(corpo(funcoes, "entregasDoEndpoint")).not.toMatch(/\.select\("[^"]*payload/);
  });

  it("o segredo é cifrado antes de gravar, e a chave inteira só sai na criação", () => {
    expect(corpo(funcoes, "criarEndpointDeWebhook")).toContain(
      "segredo: await cifrarSegredo(segredo)",
    );
    expect(corpo(funcoes, "rotacionarSegredoDeWebhook")).toContain(
      "segredo: await cifrarSegredo(segredo)",
    );
    expect(corpo(funcoes, "criarChaveDeApi")).toMatch(/hash,/); // só o hash vai ao banco
    expect(corpo(funcoes, "criarChaveDeApi")).not.toMatch(/insert\([^)]*chave[,:]/);
  });

  it("a URL do destino é validada contra rede interna ao criar", () => {
    const c = corpo(funcoes, "criarEndpointDeWebhook");
    expect(c.indexOf("validarDestinoDeWebhook(")).toBeLessThan(c.indexOf(".insert("));
  });
});

describe("API pública (leads)", () => {
  it("todo acesso à tabela leads leva a empresa da CHAVE", () => {
    const trechos = [...leads.matchAll(/\.from\("leads"\)/g)].map((m) =>
      leads.slice(m.index!, m.index! + 420),
    );
    expect(trechos.length).toBeGreaterThanOrEqual(6);
    // Leitura/atualização filtram por empresa; a ÚNICA exceção é o INSERT, que
    // leva `company_id` dentro do objeto gravado (conferido logo abaixo).
    const semFiltro = trechos.filter(
      (t) => !t.includes("ctx.companyId") && !/\.insert\(linha\)/.test(t),
    );
    expect(semFiltro).toEqual([]);
    expect(leads).toMatch(/const linha = \{\s*company_id: ctx\.companyId,/);
    expect(leads.match(/\.insert\(linha\)/g)).toHaveLength(1);
  });

  it("a empresa nunca vem do corpo, da URL ou de cabeçalho", () => {
    expect(leads).not.toMatch(/searchParams\.get\("company/);
    expect(leads).not.toMatch(/d\.company_id|parsed\.data\.company_id/);
    expect(leads).not.toMatch(/headers\.get\("x-company/);
  });

  it("as rotas autenticam com o escopo certo antes de tocar no banco", () => {
    const esperado: Array<[string, string, string]> = [
      ["src/routes/api/public/v1/leads.ts", "GET", "leads:read"],
      ["src/routes/api/public/v1/leads.ts", "POST", "leads:write"],
      ["src/routes/api/public/v1/leads.$id.ts", "GET", "leads:read"],
      ["src/routes/api/public/v1/leads.$id.ts", "PATCH", "leads:write"],
      ["src/routes/api/public/v1/stages.ts", "GET", "leads:read"],
    ];
    for (const [arq, metodo, escopo] of esperado) {
      const src = readFileSync(arq, "utf8");
      const i = src.indexOf(`${metodo}: async`);
      expect(i, `${arq} ${metodo}`).toBeGreaterThan(-1);
      const trecho = src.slice(i, i + 900);
      expect(trecho).toContain(`autenticarApi(request, admin, "${escopo}")`);
      expect(trecho.indexOf("autenticarApi(")).toBeLessThan(trecho.search(/\bauth\.ctx\b/));
    }
  });

  it("métodos não suportados respondem 405 em JSON, nunca a página do app", () => {
    for (const arq of ["leads.ts", "leads.$id.ts", "stages.ts"]) {
      const src = readFileSync(`src/routes/api/public/v1/${arq}`, "utf8");
      expect(src).toContain("DELETE:");
      expect(src).toContain("metodoNaoPermitido(");
    }
  });
});
