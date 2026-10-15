import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A ação `enviar_whatsapp` do motor de automação enviava para quem pediu para
 * parar e fora do horário. Só o caminho legado respeitava as duas regras.
 */
const fonte = readFileSync("src/routes/api/public/cron/automation-dispatch.ts", "utf8");
const acao = fonte.slice(fonte.indexOf("case 'enviar_whatsapp'"), fonte.indexOf("case 'webhook'"));

describe("ação enviar_whatsapp passa pela política", () => {
  it("consulta opt-out e horário", () => {
    expect(acao).toContain("numeroEmOptout(admin, job.company_id, numero)");
    expect(acao).toContain("janelaDaEmpresa(admin, job.company_id)");
    expect(acao).toContain("decidirEnvio({");
  });

  it("a decisão vem ANTES do envio", () => {
    expect(acao.indexOf("decidirEnvio({")).toBeGreaterThan(-1);
    expect(acao.indexOf("decidirEnvio({")).toBeLessThan(acao.indexOf("canal.provider.sendText("));
  });

  it("bloqueio é registrado como skipped, com o motivo", () => {
    expect(acao).toContain("status: 'skipped'");
    expect(acao).toContain("skipped_reason: decisao.texto");
  });

  it("alerta a número fixo da empresa não passa por opt-out de lead", () => {
    expect(acao).toContain("const paraLead = !String(cfg.para ?? '').trim();");
    expect(acao).toContain("if (paraLead) {");
  });

  it("não fala com a Evolution direto", () => {
    expect(acao).not.toContain("evolution.server");
  });
});
