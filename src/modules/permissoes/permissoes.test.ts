import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizarPermissoes, PERMISSOES_PADRAO, podeExcluirLeads } from "./permissoes";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("permissão de excluir lead", () => {
  it("o padrão é restrito: membro não exclui", () => {
    expect(PERMISSOES_PADRAO.membrosExcluemLeads).toBe(false);
    expect(podeExcluirLeads("member", PERMISSOES_PADRAO)).toBe(false);
  });
  it("dono e administrador sempre; visualizador nunca", () => {
    expect(podeExcluirLeads("owner", PERMISSOES_PADRAO)).toBe(true);
    expect(podeExcluirLeads("admin", PERMISSOES_PADRAO)).toBe(true);
    expect(podeExcluirLeads("viewer", { membrosExcluemLeads: true })).toBe(false);
    expect(podeExcluirLeads(undefined, { membrosExcluemLeads: true })).toBe(false);
  });
  it("membro exclui quando a empresa libera", () => {
    expect(podeExcluirLeads("member", { membrosExcluemLeads: true })).toBe(true);
  });
  it("valor estranho do banco cai no padrão", () => {
    expect(normalizarPermissoes(null)).toEqual(PERMISSOES_PADRAO);
    expect(normalizarPermissoes({ membros_excluem_leads: "sim" })).toEqual(PERMISSOES_PADRAO);
    expect(normalizarPermissoes({ membros_excluem_leads: true })).toEqual({ membrosExcluemLeads: true });
  });
});

describe("exclusão: ligação nas telas e no serviço", () => {
  const svc = ler("src/modules/crm/services/leadService.ts");
  it("o serviço confere as linhas apagadas antes de mexer no Storage", () => {
    for (const nome of ["deleteLeads", "deleteLead("]) {
      const ini = svc.indexOf(`export async function ${nome}`);
      const corpo = svc.slice(ini, svc.indexOf("\nexport ", ini + 1));
      expect(corpo, nome).toContain(".select('id')");
      expect(corpo, nome).toContain("SEM_PERMISSAO_PARA_EXCLUIR");
      expect(corpo.indexOf("SEM_PERMISSAO_PARA_EXCLUIR"), nome).toBeLessThan(corpo.indexOf("storage.from"));
    }
  });
  it("lista, kanban e detalhe só oferecem excluir a quem pode", () => {
    for (const f of [
      "src/routes/_app.leads.tsx",
      "src/modules/crm/components/KanbanBoard.tsx",
      "src/modules/crm/components/LeadDetailDialog.tsx",
    ])
      expect(ler(f), f).toContain("usePodeExcluirLeads()");
  });
  it("só administrador altera; migration tira o DELETE do membro comum", () => {
    expect(ler("src/lib/permissoes.functions.ts")).toContain("empresaParaAdministrar(");
    const m = ler("supabase/migrations/20261026140000_permissao_excluir_lead.sql");
    expect(m).toContain('DROP POLICY IF EXISTS "Leads access"');
    expect(m).toContain('DROP POLICY IF EXISTS "Users can manage their company leads"');
    expect(m).toContain("FOR DELETE");
    expect(m).toContain("DEFAULT false");
  });
});

import { somenteLeitura } from "./permissoes";

describe("interface do visualizador", () => {
  it("só o visualizador é somente leitura; papel desconhecido não esconde nada", () => {
    expect(somenteLeitura("viewer")).toBe(true);
    for (const p of ["owner", "admin", "member", undefined, null, ""]) expect(somenteLeitura(p as any)).toBe(false);
  });
  it("layout avisa, e lista, kanban e ficha deixam de oferecer a edição", () => {
    expect(ler("src/components/layout/AppLayout.tsx")).toContain("somenteLeitura(membership?.role)");
    expect(ler("src/routes/_app.leads.tsx")).toContain("useSomenteLeitura()");
    const k = ler("src/modules/crm/components/KanbanBoard.tsx");
    expect(k).toContain("isDragDisabled={selecting || leitura}");
    expect(k).toContain("if (leitura || !destination) return;");
    const d = ler("src/modules/crm/components/LeadDetailDialog.tsx");
    expect((d.match(/onSave=\{leitura \? undefined/g) ?? []).length).toBe(4);
  });
  it("o cliente do banco traduz o erro de permissão", () => {
    expect(ler("src/core/infrastructure/supabase-factory.ts")).toContain("fetch: fetchComErroDePermissao()");
  });
  it("audit_logs: migration sem UPDATE/DELETE para o navegador e leitura só de administrador", () => {
    const sql = ler("supabase/migrations/20261027100000_audit_logs_so_acrescenta.sql").replace(/--.*$/gm, "");
    expect(sql).toContain("eh_admin_da_empresa(company_id)");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("GRANT SELECT, INSERT ON public.audit_logs TO authenticated");
    expect(sql).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*TO authenticated/);
  });
});
