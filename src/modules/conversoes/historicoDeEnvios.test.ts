import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261030200000_historico_de_envios.sql", "utf8");
const pagina = readFileSync("src/routes/_app.settings.envios.tsx", "utf8");

describe("histórico de envios", () => {
  it("leitura só de administradores e reenvio com trilha de auditoria", () => {
    expect(sql).toMatch(/CREATE POLICY conv_dispatch_admin[\s\S]*eh_admin_da_empresa\(company_id\)/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS conv_dispatch_membro/);
    expect(sql).toMatch(/'conversao_reenviada'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reenviar_conversoes\(uuid\[\]\) FROM PUBLIC, anon/);
  });

  it("só falha e ensaio voltam para a fila, no máximo 50 por vez", () => {
    expect(sql).toMatch(/status IN \('failed', 'rehearsal'\)/);
    expect(sql).toMatch(/> 50/);
  });

  it("a página fecha para quem não administra", () => {
    expect(pagina).toMatch(/membership\?\.role === "owner" \|\| membership\?\.role === "admin"/);
    expect(pagina).toMatch(/enabled: !!companyId && ehAdmin/);
  });
});
