import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O widget de WhatsApp criava um lead NOVO a cada clique: o mesmo visitante
 * clicando duas vezes virava dois contatos no CRM. E a rota pública gravava o
 * que viesse, sem aparar nem limitar tamanho.
 */
const rota = readFileSync("src/routes/api/public/whatsapp-click.ts", "utf8");

describe("whatsapp-click reaproveita o lead do visitante", () => {
  it("procura por visitante ou e-mail antes de inserir", () => {
    const busca = rota.indexOf(".eq('metadata->>visitor_id'");
    const insercao = rota.indexOf(
      ".insert({\n              company_id: body.companyId,\n              name:",
    );
    expect(busca).toBeGreaterThan(-1);
    expect(insercao).toBeGreaterThan(-1);
    expect(busca).toBeLessThan(insercao);
  });

  it("só insere quando não achou lead", () => {
    expect(rota).toContain("if (!leadId && (body.email || body.name))");
  });

  it("a busca é restrita à empresa e à origem do widget", () => {
    const trecho = rota.slice(rota.indexOf("let busca"), rota.indexOf("let busca") + 260);
    expect(trecho).toContain(".eq('company_id', body.companyId)");
    expect(trecho).toContain(".eq('source', 'whatsapp_widget')");
  });

  it("nome e e-mail são aparados e limitados", () => {
    expect(rota).toContain("body.name = limpar(body.name, 120)");
    expect(rota).toContain("body.email = limpar(body.email, 254)");
  });
});
