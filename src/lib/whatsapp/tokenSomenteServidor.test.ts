import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * O token da Meta não pode ser legível pelo navegador. A migração tira o
 * SELECT da coluna; este teste impede que o app volte a depender dela.
 */
const migracao = readFileSync(
  "supabase/migrations/20261015170000_token_meta_somente_servidor.sql",
  "utf8",
);

describe("token da Meta somente no servidor", () => {
  it("a migração revoga o SELECT da tabela e concede só as colunas seguras", () => {
    expect(migracao).toContain("REVOKE SELECT ON public.meta_lead_connections FROM authenticated;");
    const concedidas = migracao.slice(
      migracao.indexOf("GRANT SELECT ("),
      migracao.indexOf(") ON public"),
    );
    expect(concedidas).not.toContain("access_token");
    expect(concedidas).toContain("status");
  });

  it("quem cita a tabela não importa o cliente do navegador", () => {
    // `@/lib/supabase` e `@/integrations/supabase/client` são o cliente do
    // navegador (sujeito ao GRANT). A chave de serviço vem de client.server.
    const citam = readdirSync("src/lib")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .map((f) => `src/lib/${f}`)
      .filter((f) => readFileSync(f, "utf8").includes("meta_lead_connections"));

    expect(citam.length).toBeGreaterThan(0); // o teste não é vácuo
    for (const f of citam) {
      const fonte = readFileSync(f, "utf8");
      expect(fonte, f).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
      expect(fonte, f).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    }
  });
});
