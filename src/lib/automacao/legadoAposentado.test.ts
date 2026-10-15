import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { empresaTemNumeroOficial } from "../whatsapp/canal";
import { criarDb } from "../whatsapp/cloud/dbFalso";
import type { AdminDb } from "../whatsapp/provider";

describe("empresaTemNumeroOficial", () => {
  it("com número → true", async () => {
    const { db } = criarDb({ tabelas: { wa_phone_numbers: [{ phone_number_id: "P" }] } });
    expect(await empresaTemNumeroOficial(db as unknown as AdminDb, "emp")).toBe(true);
  });
  it("sem número → false", async () => {
    const { db } = criarDb({ tabelas: { wa_phone_numbers: [] } });
    expect(await empresaTemNumeroOficial(db as unknown as AdminDb, "emp")).toBe(false);
  });
  it("tabela inexistente (migração não aplicada) → false: a Evolution segue valendo", async () => {
    const { db } = criarDb({
      erros: { "wa_phone_numbers:select": { message: "relation does not exist" } },
    });
    expect(await empresaTemNumeroOficial(db as unknown as AdminDb, "emp")).toBe(false);
  });
});

describe("dispatchLeadWhatsApp (legado)", () => {
  const f = readFileSync("src/lib/whatsapp-automation.server.ts", "utf8");
  it("empresa na API oficial: pula ANTES de qualquer envio, e registra o motivo", () => {
    const i = f.indexOf("empresaTemNumeroOficial(admin, input.companyId)");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(f.indexOf("evolutionProvider.sendText("));
    expect(f).toContain("API oficial ativa: use uma regra de automação com template");
  });
});
