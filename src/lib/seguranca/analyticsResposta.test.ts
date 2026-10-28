import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migracao = readFileSync("supabase/migrations/20261104100000_tempo_de_resposta.sql", "utf8");
const card = readFileSync("src/modules/analytics/components/TempoDeRespostaCard.tsx", "utf8");
const pagina = readFileSync("src/routes/_app.analytics.tsx", "utf8");

describe("tempo de resposta: o que conta como resposta", () => {
  it("só equipe conta: agent e app_echo; automação e envio que falhou ficam de fora", () => {
    expect(migracao).toMatch(/origin IN \('agent', 'app_echo'\)/);
    expect(migracao).toMatch(/status <> 'failed'/);
    expect(migracao).not.toMatch(/origin IN \([^)]*'automation'/);
  });
  it("confere o acesso à empresa e não abre para anônimo", () => {
    expect(migracao).toMatch(/exigir_acesso_a_empresa\(p_company_id\)/);
    expect(migracao).toMatch(
      /REVOKE ALL ON FUNCTION public\.tempo_de_resposta\(uuid, timestamptz\) FROM PUBLIC, anon/,
    );
  });
  it("o relógio começa no que vier primeiro: lead criado ou 1ª mensagem do cliente", () => {
    expect(migracao).toMatch(/least\(\s*l\.created_at/);
  });
});

describe("tempo de resposta: a tela", () => {
  it("diz a cobertura antes da mediana, tem h2 e trata erro como erro", () => {
    expect(card).toContain(
      '<h2 className="text-base font-bold leading-none tracking-tight">Tempo de resposta</h2>',
    );
    expect(card.indexOf("têm conversa no WhatsApp")).toBeLessThan(card.indexOf("Mediana"));
    expect(card).toContain("ErroDeConsulta");
  });
  it("link de 44px no celular e token de aviso, sem cor fixa", () => {
    expect(card).toContain("min-h-11");
    expect(card).toContain("var(--aviso)");
    expect(card).not.toMatch(/amber-|text-red-|text-yellow-/);
  });
  it("entra na página com o mesmo período da URL", () => {
    expect(pagina).toMatch(/queryKey: \['tempo-de-resposta', companyId, dias\]/);
    expect(pagina).toContain("<TempoDeRespostaCard");
  });
});
