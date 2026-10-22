import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync("src/lib/whatsapp-cloud.functions.ts", "utf8");
const corpo = (nome: string) => {
  const i = server.indexOf(`export const ${nome}`);
  const j = server.indexOf("\nexport const ", i + 10);
  return server.slice(i, j === -1 ? undefined : j);
};
// A lista de rascunhos mora na tela de configurações; o editor, no componente próprio.
const tela =
  readFileSync("src/routes/_app.settings.whatsapp.tsx", "utf8") +
  readFileSync("src/modules/atendimento/components/NovoTemplate.tsx", "utf8");

describe("rascunhos de template (servidor)", () => {
  it("salvar exige papel de administrador e só atualiza o que é da empresa", () => {
    const f = corpo("salvarRascunhoTemplateWhatsApp");
    expect(f).toContain("empresaParaAdministrar(admin, context.userId)");
    expect(f).toContain('.eq("id", data.id)');
    expect(f).toContain('.eq("company_id", companyId)');
  });

  it("há teto de rascunhos por empresa", () => {
    const f = corpo("salvarRascunhoTemplateWhatsApp");
    expect(f).toContain("TETO_DE_RASCUNHOS");
    expect(server).toContain("const TETO_DE_RASCUNHOS = 50");
  });

  it("apagar confere papel e empresa", () => {
    const f = corpo("apagarRascunhoTemplateWhatsApp");
    expect(f).toContain("empresaParaAdministrar(admin, context.userId)");
    expect(f).toContain('.eq("company_id", companyId)');
  });

  it("o rascunho só some quando o template realmente foi criado na Meta", () => {
    const f = corpo("criarTemplateWhatsApp");
    expect(f).toContain("if (r.ok && rascunhoId)");
    expect(f.indexOf("criarTemplate(admin")).toBeLessThan(f.indexOf("wa_template_drafts"));
    expect(f).toContain('.eq("company_id", companyId)');
  });

  it("rascunho aceita o que a Meta recusaria (é só a definição, validada no envio)", () => {
    // O rascunho usa o schema de forma, não `validarTemplate`: salvar texto
    // incompleto é o ponto.
    const f = corpo("salvarRascunhoTemplateWhatsApp");
    expect(f).not.toContain("validarTemplate");
  });

  it("o estado da tela inclui os rascunhos sem derrubar se a tabela não existe", () => {
    expect(server).toContain('.from("wa_template_drafts")');
    expect(server).toContain("rascunhos: (rascunhos ?? []) as RascunhoDeTemplate[]");
  });
});

describe("rascunhos de template (tela)", () => {
  it("tem Salvar rascunho, Continuar e Apagar, e envia o id do rascunho ao criar", () => {
    expect(tela).toContain("Salvar rascunho");
    expect(tela).toContain("Continuar");
    expect(tela).toContain("apagarRascunhoTemplateWhatsApp");
    expect(tela).toContain("...(rascunhoId ? { rascunhoId } : {})");
  });

  it("o primeiro salvar cria e os seguintes atualizam o MESMO rascunho", () => {
    expect(tela).toContain("...(rascunhoId ? { id: rascunhoId } : {})");
    expect(tela).toContain("setRascunhoId(r.id)");
  });
});
