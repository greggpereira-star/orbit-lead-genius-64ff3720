import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migracao = readFileSync(
  "supabase/migrations/20261105100000_comparativo_do_periodo.sql",
  "utf8",
);
const pagina = readFileSync("src/routes/_app.analytics.tsx", "utf8");

describe("comparativo com o período anterior", () => {
  it("usa a mesma régua de qualificação de resumo_analytics (corte marcado, senão a menor conversão)", () => {
    expect(migracao).toMatch(/is_qualified_cut/);
    expect(migracao).toMatch(/min\(s\.order_index\)/);
  });
  it("calcula as duas janelas na mesma consulta, confere acesso e fecha para anônimo", () => {
    expect(migracao).toMatch(/\('atual'\), \('anterior'\)/);
    expect(migracao).toMatch(/exigir_acesso_a_empresa\(p_company_id\)/);
    expect(migracao).toMatch(/FROM PUBLIC, anon/);
  });
  it("a página usa o mesmo período da URL, trata erro como erro e mostra a nota", () => {
    expect(pagina).toMatch(/queryKey: \['comparativo-do-periodo', companyId, dias\]/);
    expect(pagina).toMatch(/comparativo\.isError/);
    expect(pagina).toContain("<NotaDoComparativo");
  });
  it("taxa de qualificação com vírgula decimal (pt-BR)", () => {
    expect(pagina).not.toMatch(/toFixed\(1\)\}%/);
  });
});
