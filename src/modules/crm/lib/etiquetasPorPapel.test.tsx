import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const permissao = { criar: true };
vi.mock("@/modules/permissoes/usePermissoes", () => ({ usePodeGerenciar: () => permissao.criar }));
vi.mock("../services/leadNotesService", () => ({
  addLeadTag: async () => ({}),
  listCompanyTagNames: async () => ["Investidor"],
  listLeadTags: async () => [],
  removeLeadTag: async () => ({}),
}));

import { EtiquetasDoLead } from "../components/EtiquetasDoLead";

const html = (props: Record<string, unknown> = {}) => {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(EtiquetasDoLead, { leadId: "l1", companyId: "c1", ...props })),
  );
};

describe("etiquetas do lead por permissão (renderizado)", () => {
  it("quem pode criar vê o campo livre", () => {
    permissao.criar = true;
    const h = html();
    expect(h).toContain("Ex: Investidor, Primeira compra, Urgente");
    expect(h).not.toContain("Escolha uma etiqueta existente");
  });
  it("atendente sem permissão de criar é guiado a usar as existentes", () => {
    permissao.criar = false;
    const h = html();
    expect(h).toContain("Escolha uma etiqueta existente");
    expect(h).not.toContain("Ex: Investidor");
  });
  it("visualizador (somente leitura) não vê campo nenhum para adicionar", () => {
    permissao.criar = false;
    const h = html({ somenteLeitura: true });
    expect(h).not.toContain("Nova etiqueta");
    expect(h).not.toContain("Adicionar etiqueta");
  });
});
