import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const funcoes = readFileSync("src/lib/origem.functions.ts", "utf8");
const webhook = readFileSync("src/routes/api/public/whatsapp-webhook.ts", "utf8");
const processador = readFileSync("src/lib/whatsapp/cloud/processador.ts", "utf8");
const sql = readFileSync("supabase/migrations/20261102200000_origem_por_mensagem.sql", "utf8");

const corpo = (src: string, nome: string) => {
  const i = src.indexOf(`export const ${nome}`);
  expect(i, nome).toBeGreaterThan(-1);
  const f = src.indexOf("\nexport ", i + 10);
  return src.slice(i, f === -1 ? undefined : f);
};

describe("regras de origem (server functions)", () => {
  it("criar, ligar e remover exigem dono/administrador antes de tocar no banco", () => {
    for (const nome of ["criarRegraDeOrigem", "alternarRegraDeOrigem", "removerRegraDeOrigem"]) {
      const c = corpo(funcoes, nome);
      const conf = c.indexOf("empresaDoAdministrador(admin, context.userId)");
      expect(conf, nome).toBeGreaterThan(-1);
      expect(conf).toBeLessThan(c.indexOf('.from("origin_rules")'));
    }
  });
  it("alterar e remover filtram pela empresa do usuário", () => {
    for (const nome of ["alternarRegraDeOrigem", "removerRegraDeOrigem"]) {
      expect(corpo(funcoes, nome)).toContain('.eq("company_id", companyId)');
    }
  });
  it("o canal da regra só pode ser um dos atribuíveis (zod enum)", () => {
    expect(corpo(funcoes, "criarRegraDeOrigem")).toContain("z.enum(CANAIS_ATRIBUIVEIS)");
  });
});

describe("pontos onde a regra por mensagem é aplicada", () => {
  it("WhatsApp oficial: só depois de registrar a mensagem e sem anúncio na conversa", () => {
    const i = processador.indexOf('"aplicar_regras_de_origem_ao_lead"');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(processador.indexOf('"wa_registrar_mensagem"'));
    expect(processador.slice(i - 200, i)).toContain("leadId && !e.referral");
  });
  it("Evolution: depois de gravar a mensagem, só com lead e sem clique", () => {
    const i = webhook.indexOf('"aplicar_regras_de_origem_ao_lead"');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(webhook.indexOf('from("whatsapp_messages").insert'));
    expect(webhook.slice(i - 250, i)).toContain("leadId && !clique");
  });
});

describe("banco", () => {
  it("só atua em lead ainda não rastreado (prova e atribuição nunca são trocadas)", () => {
    const f = sql.slice(sql.indexOf("FUNCTION public.aplicar_regras_de_origem_ao_lead"));
    expect(f).toContain("canal_do_lead(l) <> 'nao_rastreado' THEN RETURN NULL");
  });
  it("atribuir e aplicar exigem escrita na empresa; o lote exige administrador", () => {
    expect(sql).toMatch(/definir_origem_do_lead[\s\S]*pode_escrever_na_empresa\(v_empresa\)/);
    expect(sql).toMatch(
      /aplicar_regras_de_origem_ao_lead[\s\S]*pode_escrever_na_empresa\(l\.company_id\)/,
    );
    expect(sql).toMatch(
      /FUNCTION public\.aplicar_regras_de_origem\(p_company_id[\s\S]*eh_admin_da_empresa\(p_company_id\)/,
    );
  });
  it("mensagens do cliente não ficam acessíveis ao navegador (função só do servidor)", () => {
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.mensagens_iniciais_do_lead(uuid) TO service_role;",
    );
    expect(sql).not.toMatch(/mensagens_iniciais_do_lead\(uuid\) TO authenticated/);
  });
});

describe("página de Analytics", () => {
  const pagina = readFileSync("src/routes/_app.analytics.tsx", "utf8");
  it("a tile de origem usa a MESMA consulta do card por canal (não conta cliques de WhatsApp)", () => {
    expect(pagina).toContain("queryFn: () => origemDosLeads(companyId, Number(dias))");
    expect(pagina).toContain("Origem identificada");
    expect(pagina).not.toContain("com_identificador");
  });
  it("o painel antigo de origem em texto livre saiu", () => {
    expect(pagina).not.toContain("por_origem");
    expect(pagina).not.toContain("De onde vieram no período.");
  });
});
