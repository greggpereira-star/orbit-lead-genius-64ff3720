import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const m = readFileSync(
  join(process.cwd(), "supabase/migrations/20261026160000_visualizador_nao_escreve.sql"),
  "utf8",
);

describe("visualizador só lê (migration)", () => {
  it("usa política RESTRITIVA nos três comandos de escrita e nunca concede nada", () => {
    for (const cmd of ["INSERT", "UPDATE", "DELETE"])
      expect(m).toContain(`AS RESTRICTIVE FOR ${cmd} TO authenticated`);
    expect(m).not.toMatch(/AS PERMISSIVE/);
  });

  it("só dono, administrador e atendente passam", () => {
    const sql = m.replace(/--.*$/gm, "");
    expect(sql).toContain("m.role IN ('owner', 'admin', 'member')");
    expect(sql).not.toContain("viewer");
  });

  it("cobre as tabelas de dados e configuração e deixa de fora as que o app grava ao navegar", () => {
    for (const t of ["leads", "lead_notes", "lead_attachments", "integrations", "oauth_connections", "routing_configs", "forms", "quiz_funnels", "stages"])
      expect(m, t).toContain(`'${t}'`);
    const lista = m.slice(m.indexOf("ARRAY["), m.indexOf("]\n  LOOP"));
    for (const t of ["audit_logs", "lead_events", "chat_messages", "quiz_events", "quiz_submissions", "quiz_edit_locks", "companies", "memberships"])
      expect(lista, t).not.toContain(`'${t}'`);
  });
});
