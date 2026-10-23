import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mensagemDoErro } from "../services/customFieldService";

const ler = (p: string) => readFileSync(p, "utf8");

describe("campos personalizados: decisões", () => {
  const sql = ler("supabase/migrations/20261025140000_campos_personalizados.sql");

  it("não mistura com leads.metadata (rastro de origem): coluna própria", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS custom_fields jsonb");
    expect(sql).not.toMatch(/UPDATE public\.leads\s+SET metadata/i);
  });

  it("grava por função que valida o tipo, uma chave por vez, com os direitos de quem chama", () => {
    expect(sql).toContain("definir_campo_do_lead");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("jsonb_set(custom_fields");
  });

  it("os campos entram nas automações como cf_<chave>, no enfileirar e na varredura", () => {
    expect(sql).toContain("'cf_' || e.key");
    expect(sql).toContain("public.campos_do_lead(p_lead_id) || coalesce(p_payload");
    expect(
      (sql.match(/\|\| public\.campos_do_lead\((m|b)\.lead_id\) AS payload/g) ?? []).length,
    ).toBe(4);
  });

  it("campos_do_lead não é chamável por quem entra pela API", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.campos_do_lead\(uuid\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("só owner/admin criam campos; todos da empresa leem", () => {
    expect(sql).toContain("m.role IN ('owner', 'admin')");
    expect(sql).toContain("custom_field_defs_leitura");
  });
});

describe("campos personalizados na tela", () => {
  it("a ficha do CRM e o painel da conversa usam o mesmo componente", () => {
    expect(ler("src/modules/crm/components/LeadDetailDialog.tsx")).toContain("<CamposDoLead");
    expect(ler("src/modules/atendimento/components/PainelDoLead.tsx")).toContain("<CamposDoLead");
  });

  it("o editor de regras oferece os campos como condição e variável, e não os perde ao trocar o evento", () => {
    const r = ler("src/modules/automation/components/RegraDialog.tsx");
    expect(r).toContain("variavelDaAutomacao(d.key)");
    expect(r).toContain("c.campo.startsWith('cf_')");
  });

  it("a página de configuração está no menu", () => {
    expect(ler("src/routes/_app.settings.tsx")).toContain('to: "/settings/campos"');
  });
});

describe("mensagem de erro legível", () => {
  it("traduz o que o banco responde", () => {
    expect(mensagemDoErro({ message: "valor_invalido: Orçamento não é número" })).toBe(
      "Orçamento não é número",
    );
    expect(mensagemDoErro({ message: "campo_inexistente" })).toBe("Esse campo não existe mais.");
    expect(mensagemDoErro({ code: "23505", message: "dup" })).toBe(
      "Já existe um campo com essa chave.",
    );
    expect(mensagemDoErro({ message: "new row violates row-level security policy" })).toMatch(
      /permissão/,
    );
    expect(mensagemDoErro({})).toBe("Não deu certo.");
  });
});
