import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/routes/api/public/wa-webhook.ts", "utf8");
const varredor = readFileSync("src/routes/api/public/cron/wa-webhook-sweep.ts", "utf8");

describe("rota /api/public/wa-webhook", () => {
  const post = hook.slice(hook.indexOf("POST: async"));

  it("a assinatura é conferida ANTES de interpretar o corpo", () => {
    expect(post.indexOf("verificarAssinaturaMeta(")).toBeGreaterThan(-1);
    expect(post.indexOf("verificarAssinaturaMeta(")).toBeLessThan(
      post.indexOf("JSON.parse(corpoCru)"),
    );
  });

  it("assinatura inválida é 401 e sem segredo é 503 (nunca aceita)", () => {
    expect(post).toContain('new Response("Invalid signature", { status: 401 })');
    expect(post).toContain('new Response("Not configured", { status: 503 })');
  });

  it("o corpo usado na assinatura é o CRU", () => {
    expect(post).toContain("await request.text()");
    expect(post).toContain("verificarAssinaturaMeta(corpoCru,");
  });

  it("rejeita corpo grande (413) antes e depois de ler, antes da assinatura", () => {
    expect(post).toContain("LIMITE_CORPO_BYTES");
    expect(post).toContain('new Response("Payload too large", { status: 413 })');
    expect(post.indexOf("Payload too large")).toBeLessThan(
      post.indexOf("verificarAssinaturaMeta("),
    );
    expect(post.indexOf('request.headers.get("content-length")')).toBeLessThan(
      post.indexOf("await request.text()"),
    );
  });

  it("a verificação (GET) usa o token próprio e compara em tempo constante", () => {
    expect(hook).toContain("WA_WEBHOOK_VERIFY_TOKEN");
    expect(hook).toContain('segredoConfere(url.searchParams.get("hub.verify_token"), esperado)');
  });

  it("erro de PROCESSAMENTO não vira erro HTTP; só falha ao guardar pede reentrega", () => {
    expect(post).toContain('return new Response("ok", { status: 200 })');
    expect(post).toContain("void processarPendentes(");
    expect(post).toContain('return new Response("Retry", { status: 500 })');
  });

  it("a empresa nunca vem do corpo da requisição", () => {
    expect(hook).not.toMatch(/company_?id|companyId/);
  });
});

describe("varredor de eventos", () => {
  it("FALHA FECHADO: sem CRON_SECRET recusa, e não tem segredo padrão", () => {
    expect(varredor).toContain("if (!segredo || !segredoConfere(enviado, segredo))");
    expect(varredor).not.toMatch(/CRON_SECRET\s*\|\|/);
    expect(varredor).not.toContain("altflow_retry_sync_secret");
  });
});
