import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/whatsapp-labels.functions", () => ({
  listarEtiquetasDaEmpresa: async () => ({ ok: false, etiquetas: [], motivo: "x" }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));

import { ConversionSettingsTable } from "../components/ConversionSettingsTable";

describe("ConversionSettingsTable (renderizado, sem dados)", () => {
  it("monta sem quebrar e mostra a barra de ações com Salvar desabilitado", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ConversionSettingsTable companyId="c1" />
      </QueryClientProvider>,
    );
    expect(html).toContain("Salvar configurações");
    expect(html).toContain("Sugerir pelo funil");
    expect(html).toContain("Cancelar");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Salvar configurações/s);
    expect(html).toContain("Boas práticas");
  });
});
