import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sem = (s: string) => s.replace(/--.*$/gm, "");

describe("gravação filtrada pelo RLS não pode parecer sucesso", () => {
  it("mover etapa confere as linhas atualizadas ANTES de gravar o evento na linha do tempo", () => {
    const s = ler("src/modules/crm/services/stageService.ts");
    const ini = s.indexOf("export async function moveLeadToStage");
    const corpo = s.slice(ini, s.indexOf("\nexport ", ini + 1));
    expect(corpo).toContain(".select('id')");
    expect(corpo).toContain("MENSAGEM_SEM_PERMISSAO");
    expect(corpo.indexOf("MENSAGEM_SEM_PERMISSAO")).toBeLessThan(corpo.indexOf("lead_events"));
  });
  it("atribuir responsável também", () => {
    const s = ler("src/modules/crm/services/leadService.ts");
    const ini = s.indexOf("export async function atribuirResponsavel");
    const corpo = s.slice(ini, s.indexOf("\nexport ", ini + 1) < 0 ? undefined : s.indexOf("\nexport ", ini + 1));
    expect(corpo).toContain(".select('id')");
    expect(corpo).toContain("MENSAGEM_SEM_PERMISSAO");
  });
});

describe("o que o visualizador não vê", () => {
  it("LGPD: baixar e eliminar dados seguem as permissões de exportar e excluir", () => {
    const s = ler("src/modules/crm/components/DadosDoTitular.tsx");
    expect(s).toContain("usePodeExcluirLeads()");
    expect(s).toContain("usePodeExportar()");
    expect(s).toContain("{podeExportarDados && (");
    expect(s).toContain("{podeExcluir && (");
  });
  it("ficha: ações rápidas, próximos passos, responsável, nota, etapa, etiquetas e campos", () => {
    expect(ler("src/modules/crm/components/LeadQuickActions.tsx").match(/\{!leitura && \(/g)?.length).toBe(2);
    const n = ler("src/modules/crm/components/NextActions.tsx");
    expect(n).toContain("{!leitura && (");
    expect(n).toContain("disabled={leitura}");
    expect(ler("src/modules/crm/components/OwnerPicker.tsx")).toContain("disabled={atribuir.isPending || leitura}");
    const d = ler("src/modules/crm/components/LeadDetailDialog.tsx");
    expect(d).toContain("somenteLeitura={leitura}");
    expect(d).toContain('disabled={leitura}');
  });
  it("pipeline: sem mover cartão, sem Selecionar (excluir) e sem 'arraste' para quem só lê", () => {
    expect(ler("src/modules/crm/components/KanbanBoard.tsx")).toContain("{!selecting && !leitura && stages.length > 1 && (");
    const p = ler("src/routes/_app.pipeline.tsx");
    expect(p).toContain("{podeExcluirLeads && (");
    expect(p).toContain("leitura ? ''");
  });
});

describe("migrations de papel", () => {
  it("funções SECURITY DEFINER: as 14 são conferidas e a migration aborta se alguma não mudar", () => {
    const m = sem(ler("supabase/migrations/20261028200000_papel_nas_funcoes_de_escrita.sql"));
    for (const f of [
      "eliminar_dados_do_titular", "exportar_dados_do_titular", "definir_motivo_da_perda", "save_company_pixel_settings",
      "quiz_lock_adquirir", "quiz_lock_pedir", "quiz_lock_soltar", "update_form_with_fields",
      "create_form_with_fields", "save_form_v2", "save_form_core_v1", "save_form_builder_v1",
      "save_form_fields_delta_v1", "save_form_options_batch_v1",
    ]) expect(m, f).toContain(f);
    expect(m).toContain("public.pode_excluir_lead(v_lead.company_id)");
    expect(m).toContain("public.pode_exportar_dados(v_lead.company_id)");
    expect(m).toContain("RAISE EXCEPTION 'trecho a trocar não encontrado");
    expect(m).toContain("RAISE EXCEPTION 'conferência de papel não aplicada");
  });
  it("lead_events: política restritiva nos três comandos", () => {
    const m = sem(ler("supabase/migrations/20261028300000_lead_events_visualizador.sql"));
    for (const c of ["INSERT", "UPDATE", "DELETE"]) expect(m).toContain(`AS RESTRICTIVE FOR ${c} TO authenticated`);
  });
});

describe("tela Equipe", () => {
  it("usa chave de cache própria (a do seletor de responsável tem outro formato)", () => {
    expect(ler("src/routes/_app.settings.equipe.tsx")).toContain('["equipe-gestao", companyId]');
    expect(ler("src/modules/crm/components/OwnerPicker.tsx")).toContain("queryKey: ['equipe', companyId]");
  });
});
