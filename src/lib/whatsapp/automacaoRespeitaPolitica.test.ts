import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A ação de envio do motor de automação enviava para quem pediu para parar e
 * fora do horário. A política mora agora em `acoesDeWhatsApp.ts` (extraída do
 * despachante para ser testada de verdade — ver `acoesDeWhatsApp.test.ts`);
 * aqui fica o guarda de estrutura: ninguém pode reintroduzir um envio que
 * contorne a decisão.
 */
const fonte = readFileSync("src/lib/automacao/acoesDeWhatsApp.ts", "utf8");
const despachante = readFileSync("src/routes/api/public/cron/automation-dispatch.ts", "utf8");

describe("ações de WhatsApp passam pela política", () => {
  it("consulta opt-out e horário", () => {
    expect(fonte).toContain("numeroEmOptout(admin, job.company_id, numero)");
    expect(fonte).toContain("janelaDaEmpresa(admin, job.company_id)");
    expect(fonte).toContain("decidirEnvio({");
  });

  it("a decisão vem ANTES de qualquer envio", () => {
    const decisao = fonte.indexOf("decidirEnvio({");
    expect(decisao).toBeGreaterThan(-1);
    expect(decisao).toBeLessThan(fonte.indexOf("enviarTemplateNaConversa(db"));
    expect(decisao).toBeLessThan(fonte.indexOf("enviarTextoNaConversa(db"));
    expect(decisao).toBeLessThan(fonte.indexOf("canal.provider.sendText("));
  });

  it("bloqueio é registrado como skipped, com o motivo", () => {
    expect(fonte).toContain('status: "skipped"');
    expect(fonte).toContain("skipped_reason: decisao.texto");
  });

  it("alerta a número fixo da empresa não passa pela política de lead", () => {
    expect(fonte).toContain('const paraLead = !String(cfg.para ?? "").trim();');
    expect(fonte).toContain("if (paraLead) {");
  });

  it("o despachante não fala com provedor nenhum direto", () => {
    expect(despachante).not.toContain("evolution.server");
    expect(despachante).not.toContain("sendText(");
  });
});
