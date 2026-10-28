import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261109100000_empresa_unica_por_usuario.sql", "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const orquestrador = readFileSync("src/core/auth/services/WorkspaceOrchestrator.ts", "utf8");

describe("uma empresa por usuário novo", () => {
  it("a função do banco trava por usuário antes de decidir se cria", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('workspace:' \|\| p_user_id::text, 0\)\)/);
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("INSERT INTO public.companies"));
  });
  it("cria o vínculo de dono na mesma função e não renomeia empresa alheia numa colisão de slug", () => {
    expect(sql).toMatch(/INSERT INTO public\.memberships \(company_id, user_id, role\)/);
    expect(sql).not.toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
  });
  it("não adota empresa órfã só por ter sido criada pelo usuário", () => {
    expect(sql).not.toMatch(/created_by\s*=\s*p_user_id/);
  });
  it("o cliente só cria empresa na mão se a função não existe, e aceita vínculo já criado", () => {
    expect(orquestrador).toContain("compError.code !== 'PGRST202'");
    expect(orquestrador).toContain("memError.code !== '23505'");
  });
});
