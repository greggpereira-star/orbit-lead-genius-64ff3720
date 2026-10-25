import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const m = readFileSync(join(process.cwd(), "supabase/migrations/20261029100000_funcoes_internas_fechadas.sql"), "utf8");
const sql = m.replace(/--.*$/gm, "");

describe("funções internas fechadas (migration)", () => {
  it("enfileirar_automacao e check_membership_internal saem de anon e logado; só o servidor chama", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.enfileirar_automacao(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.enfileirar_automacao(uuid, text, uuid, jsonb, text) TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.check_membership_internal(uuid, uuid) FROM PUBLIC, anon, authenticated");
  });

  it("'ser o servidor' vem do ajuste `role`, nunca do JWT (visitante sem JWT apareceria como nulo)", () => {
    const f = sql.slice(sql.indexOf("FUNCTION public.chamada_de_servidor"), sql.indexOf("FUNCTION public.exigir_acesso_a_empresa"));
    expect(f).toContain("current_setting('role', true)");
    expect(f).not.toContain("auth.role()");
    expect(f).not.toContain("jwt");
  });

  it("as quatro funções que vazavam passam a conferir quem chama", () => {
    expect(sql).toContain("SELECT public.exigir_acesso_a_empresa(p_company_id);");
    expect(sql).toContain("'resumo_analytics', 'relatorio_anuncios'");
    expect(sql).toContain("PERFORM public.exigir_acesso_a_empresa((SELECT company_id FROM public.routing_configs WHERE id = p_config_id))");
    expect(sql).toContain("p_user_id IS DISTINCT FROM auth.uid()");
  });

  it("falha alto: se o ponto de inserção não existir, a migration aborta", () => {
    expect((sql.match(/RAISE EXCEPTION 'ponto de inserção não encontrado/g) ?? []).length).toBe(3);
  });

  it("as funções de RLS só respondem a membros", () => {
    const a = sql.slice(sql.indexOf("FUNCTION public.empresa_do_lead"), sql.indexOf("FUNCTION public.etiqueta_ja_existe"));
    expect(a).toContain("public.check_membership(l.company_id)");
    const b = sql.slice(sql.indexOf("FUNCTION public.etiqueta_ja_existe"), sql.indexOf("DO $$"));
    expect(b).toContain("public.check_membership(p_company_id)");
  });

  it("anon mantém só o que é público por desenho; e nada citado em política ou chamado por outra função", () => {
    for (const f of ["form_publico", "form_rascunho_ler", "form_rascunho_salvar", "form_submit_publico", "quiz_capture_lead", "public_pixel_config", "is_chat_domain_allowed", "check_membership"])
      expect(sql, f).toContain(`'${f}'`);
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("pg_policy");
    expect(sql).toContain("q.prosrc ~");
  });
});

describe("o app não chama de fora as funções que foram fechadas", () => {
  const dir = join(process.cwd(), "src");
  const ler = (p: string) => readFileSync(join(dir, p), "utf8");
  it("ninguém chama enfileirar_automacao nem check_membership_internal pelo cliente", () => {
    for (const f of ["lib/whatsapp-atendimento.functions.ts", "routes/api/public/cron/automation-dispatch.ts", "modules/crm/services/leadService.ts"]) {
      const s = ler(f);
      expect(s, f).not.toMatch(/rpc\(\s*['"]enfileirar_automacao['"]/);
      expect(s, f).not.toMatch(/rpc\(\s*['"]check_membership_internal['"]/);
    }
  });
});
