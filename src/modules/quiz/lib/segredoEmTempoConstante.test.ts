import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { segredoConfere } from "@/lib/segredo.server";

describe("segredoConfere", () => {
  it("só confere quando é idêntico", () => {
    expect(segredoConfere("abc123", "abc123")).toBe(true);
    expect(segredoConfere("abc124", "abc123")).toBe(false);
    expect(segredoConfere("abc12", "abc123")).toBe(false);
  });
  it("vazio ou ausente nunca confere — nem vazio contra vazio", () => {
    expect(segredoConfere("", "")).toBe(false);
    expect(segredoConfere(null, "x")).toBe(false);
    expect(segredoConfere("x", undefined)).toBe(false);
  });
});

describe("as rotas públicas usam a comparação segura", () => {
  const retry = readFileSync("src/routes/api/public/whatsapp-capi-retry.ts", "utf8");
  const hook = readFileSync("src/routes/api/public/whatsapp-webhook.ts", "utf8");
  it("sem === contra segredo", () => {
    expect(retry).not.toMatch(/bearer === /);
    expect(hook).not.toMatch(/get\("token"\) !== secret/);
    expect(retry).toContain("segredoConfere(bearer, envSecret)");
    expect(hook).toContain('segredoConfere(url.searchParams.get("token"), secret)');
  });
});

describe("o reenvio do CAPI leva o e-mail do lead", () => {
  const retry = readFileSync("src/routes/api/public/whatsapp-capi-retry.ts", "utf8");
  it("busca o e-mail pelo lead_id e o passa ao envio", () => {
    expect(retry).toContain("lead_id, event_id");
    expect(retry).toContain("email: row.lead_id ? (emailPorLead.get(row.lead_id) ?? null) : null");
  });
});
