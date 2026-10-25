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
    expect(podeExcluirLeads("viewer", { ...PERMISSOES_PADRAO, membrosExcluemLeads: true })).toBe(false);
    expect(podeExcluirLeads(undefined, { ...PERMISSOES_PADRAO, membrosExcluemLeads: true })).toBe(false);
  });
  it("membro exclui quando a empresa libera", () => {
    expect(podeExcluirLeads("member", { ...PERMISSOES_PADRAO, membrosExcluemLeads: true })).toBe(true);
  });
  it("valor estranho do banco cai no padrão", () => {
    expect(normalizarPermissoes(null)).toEqual(PERMISSOES_PADRAO);
    expect(normalizarPermissoes({ membros_excluem_leads: "sim" })).toEqual(PERMISSOES_PADRAO);
    expect(normalizarPermissoes({ membros_excluem_leads: true })).toEqual({ ...PERMISSOES_PADRAO, membrosExcluemLeads: true });
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

import { podeExportar } from "./permissoes";

describe("permissão de exportar", () => {
  const liberado = { ...PERMISSOES_PADRAO, membrosExportam: true };
  it("o padrão é restrito: atendente não exporta", () => {
    expect(PERMISSOES_PADRAO.membrosExportam).toBe(false);
    expect(podeExportar("member", PERMISSOES_PADRAO)).toBe(false);
  });
  it("dono e administrador sempre; visualizador nunca; atendente quando liberado", () => {
    expect(podeExportar("owner", PERMISSOES_PADRAO)).toBe(true);
    expect(podeExportar("admin", PERMISSOES_PADRAO)).toBe(true);
    expect(podeExportar("viewer", liberado)).toBe(false);
    expect(podeExportar(undefined, liberado)).toBe(false);
    expect(podeExportar("member", liberado)).toBe(true);
  });
  it("as permissões são independentes", () => {
    expect(normalizarPermissoes({ membros_exportam: true })).toEqual({ ...PERMISSOES_PADRAO, membrosExportam: true });
    expect(normalizarPermissoes({ membros_excluem_leads: true })).toEqual({ ...PERMISSOES_PADRAO, membrosExcluemLeads: true });
    expect(normalizarPermissoes({ membros_exportam: "sim" }).membrosExportam).toBe(false);
  });
  it("os cinco pontos de exportação respeitam a regra; o do servidor é barrado de verdade", () => {
    for (const f of [
      "src/routes/_app.leads.tsx",
      "src/modules/capture/components/events/FormSubmissionsPanel.tsx",
      "src/routes/_app.quizzes_.$id.responses.tsx",
      "src/routes/_app.quizzes_.$id.performance.tsx",
      "src/modules/atendimento/components/Atendimento.tsx",
    ])
      expect(ler(f), f).toContain("usePodeExportar()");
    const fn = ler("src/lib/whatsapp-atendimento.functions.ts");
    const ini = fn.indexOf("export const exportarConversaWhatsApp");
    const corpo = fn.slice(ini, fn.indexOf("\nexport const ", ini + 1) < 0 ? undefined : fn.indexOf("\nexport const ", ini + 1));
    expect(corpo).toContain("podeExportarNaEmpresa(");
    expect(corpo.indexOf("podeExportarNaEmpresa(")).toBeLessThan(corpo.indexOf('.from("wa_messages")'));
    expect(ler("supabase/migrations/20261027140000_permissao_exportar.sql")).toContain("membros_exportam boolean NOT NULL DEFAULT false");
  });
});

import { podeGerenciar } from "./permissoes";

describe("permissões de estrutura (etapas, etiquetas, campos)", () => {
  const todas = { ...PERMISSOES_PADRAO, membrosGerenciamEtapas: true, membrosCriamEtiquetas: true, membrosCriamCampos: true };
  const nenhuma = { ...PERMISSOES_PADRAO, membrosGerenciamEtapas: false, membrosCriamEtiquetas: false, membrosCriamCampos: false };
  it("padrões: etapas e campos fechados, etiqueta aberta", () => {
    expect(podeGerenciar("member", PERMISSOES_PADRAO, "etapas")).toBe(false);
    expect(podeGerenciar("member", PERMISSOES_PADRAO, "campos")).toBe(false);
    expect(podeGerenciar("member", PERMISSOES_PADRAO, "etiquetas")).toBe(true);
  });
  it("dono e administrador sempre; visualizador nunca, mesmo com tudo liberado", () => {
    for (const t of ["etapas", "etiquetas", "campos"] as const) {
      expect(podeGerenciar("owner", nenhuma, t)).toBe(true);
      expect(podeGerenciar("admin", nenhuma, t)).toBe(true);
      expect(podeGerenciar("viewer", todas, t)).toBe(false);
      expect(podeGerenciar(undefined, todas, t)).toBe(false);
      expect(podeGerenciar("member", todas, t)).toBe(true);
      expect(podeGerenciar("member", nenhuma, t)).toBe(false);
    }
  });
  it("só um false explícito desliga a etiqueta; as outras só ligam com true explícito", () => {
    expect(normalizarPermissoes(null).membrosCriamEtiquetas).toBe(true);
    expect(normalizarPermissoes({}).membrosCriamEtiquetas).toBe(true);
    expect(normalizarPermissoes({ membros_criam_etiquetas: false }).membrosCriamEtiquetas).toBe(false);
    expect(normalizarPermissoes({ membros_gerenciam_etapas: "sim" }).membrosGerenciamEtapas).toBe(false);
    expect(normalizarPermissoes({ membros_criam_campos: true }).membrosCriamCampos).toBe(true);
  });
  it("telas e banco ligados à regra", () => {
    expect(ler("src/routes/_app.pipeline.tsx")).toContain("usePodeGerenciar('etapas')");
    expect(ler("src/routes/_app.settings.campos.tsx")).toContain('usePodeGerenciar("campos")');
    expect(ler("src/modules/crm/components/EtiquetasDoLead.tsx")).toContain('usePodeGerenciar("etiquetas")');
    const sql = ler("supabase/migrations/20261027200000_permissoes_de_estrutura.sql").replace(/--.*$/gm, "");
    expect(sql).toContain('DROP POLICY IF EXISTS "Stages access"');
    expect(sql).toContain("membros_criam_etiquetas boolean NOT NULL DEFAULT true");
    expect(sql).toContain("membros_gerenciam_etapas boolean NOT NULL DEFAULT false");
    expect(sql).toContain("membros_criam_campos boolean NOT NULL DEFAULT false");
    expect(sql).toContain("AS RESTRICTIVE FOR INSERT TO authenticated");
    for (const t of ["lead_tags", "form_tag_rules", "conversion_mapping", "meta_lead_import_jobs", "quiz_submissions"])
      expect(sql, t).toContain(t);
  });
});
