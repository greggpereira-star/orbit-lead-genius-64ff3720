import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migracao = readFileSync("supabase/migrations/20261106100000_contato_registrado.sql", "utf8");
const botao = readFileSync("src/modules/crm/components/LeadQuickActions.tsx", "utf8");
const servico = readFileSync("src/modules/crm/services/contatoService.ts", "utf8");
const card = readFileSync("src/modules/analytics/components/TempoDeRespostaCard.tsx", "utf8");

describe("contato registrado: o banco", () => {
  it("a tabela só acrescenta: o app não tem privilégio de escrita direta", () => {
    expect(migracao).toMatch(/REVOKE ALL ON public\.lead_contacts FROM PUBLIC, anon, authenticated/);
    expect(migracao).toMatch(/GRANT SELECT ON public\.lead_contacts TO authenticated/);
    expect(migracao).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
    expect(migracao).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
  it("a função fixa autor e horário no servidor e barra visualizador, anônimo e canal inválido", () => {
    expect(migracao).toMatch(/pode_escrever_na_empresa\(v_empresa\)/);
    expect(migracao).toMatch(/auth\.uid\(\)/);
    expect(migracao).not.toMatch(/registrar_contato\([^)]*p_(quando|author|autor|created)/);
    expect(migracao).toMatch(/canal inválido/);
    expect(migracao).toMatch(
      /REVOKE ALL ON FUNCTION public\.registrar_contato\(uuid, text\) FROM PUBLIC, anon/,
    );
  });
  it("apagar o lead leva os registros junto", () => {
    expect(migracao).toMatch(/lead_id\s+uuid NOT NULL REFERENCES public\.leads\(id\) ON DELETE CASCADE/);
  });
  it("o tempo de resposta usa o menor entre WhatsApp da equipe e contato registrado, sem automação", () => {
    expect(migracao).toMatch(/least\(primeira_whatsapp, primeira_manual\)/);
    expect(migracao).toMatch(/origin IN \('agent', 'app_echo'\)/);
    expect(migracao).toMatch(
      /REVOKE ALL ON FUNCTION public\.tempo_de_resposta\(uuid, timestamptz\) FROM PUBLIC, anon/,
    );
  });
});

describe("contato registrado: a tela", () => {
  it("o botão não aparece para quem só lê e passa pela função, não pela tabela", () => {
    expect(botao).toMatch(/\{!leitura && \(\s*<div className="grid gap-1\.5">/);
    expect(servico).toContain('rpc("registrar_contato"');
    expect(servico).not.toMatch(/\.from\("lead_contacts"\)\s*\.(insert|update|delete|upsert)/);
  });
  it("avisa que vale o horário do clique e atualiza o tempo de resposta", () => {
    expect(botao).toContain("Vale o horário do clique");
    expect(botao).toContain("'tempo-de-resposta'");
  });
  it("itens do menu com 44px no celular", () => {
    expect(botao).toContain("min-h-11");
  });
  it("o cartão diz que o horário do registro pode ser posterior ao contato real", () => {
    expect(card).toContain("pode ser depois do");
    expect(card).toContain("têm conversa no WhatsApp ligada");
  });
});
