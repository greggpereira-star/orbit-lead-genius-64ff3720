import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(p, "utf8");

/** Guardas das decisões da feature "Tarefas por lead" (não medem layout). */
describe("tarefas por lead: decisões", () => {
  it("é a mesma anotação com data (lead_notes), não uma segunda tabela de tarefas", () => {
    const sql = ler("supabase/migrations/20261024200000_tarefas_por_lead.sql");
    expect(sql).toContain("ALTER TABLE public.lead_notes");
    expect(sql).not.toMatch(/CREATE TABLE[^;]*lead_tasks/i);
    // tarefa = anotação COM data
    expect(sql).toContain("scheduled_for IS NULL");
  });

  it("concluir passa pela função do banco, não por UPDATE direto (a política só deixa o autor editar)", () => {
    const servico = ler("src/modules/crm/services/leadNotesService.ts");
    expect(servico).toContain("rpc('concluir_tarefa'");
    expect(servico).not.toMatch(/\.from\('lead_notes'\)\s*\.update\(\{\s*done/);
  });

  it("o aviso de vencimento olha só as últimas 12 h (não inunda com as atrasadas antigas)", () => {
    expect(ler("supabase/migrations/20261024200000_tarefas_por_lead.sql")).toContain(
      "interval '12 hours'",
    );
  });

  it("a tela de tarefas está no menu e usa os mesmos dados da conversa", () => {
    expect(ler("src/design-system/components/AppSidebar.tsx")).toContain("to: '/tarefas'");
    const painel = ler("src/modules/atendimento/components/PainelDoLead.tsx");
    expect(painel).toContain("TarefasDoLead");
    expect(painel).toContain('titulo="Tarefas"');
  });

  it("nenhum texto da tela mostra minutos brutos de prazo: usa duracaoCurta", () => {
    expect(ler("src/modules/crm/lib/tarefas.ts")).toContain("duracaoCurta");
    expect(ler("src/lib/automacao/notificarEquipe.ts")).toContain("duracaoCurta");
  });
});
