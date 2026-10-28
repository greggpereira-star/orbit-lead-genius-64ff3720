import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261031100000_gasto_por_anuncio.sql', 'utf8');
const funcoes = readFileSync('src/lib/gasto.functions.ts', 'utf8');
const cron = readFileSync('src/routes/api/public/cron/ad-spend-sync.ts', 'utf8');

describe('gasto por anúncio — segurança', () => {
  it('o navegador só lê: sem escrita em ad_spend_daily para authenticated', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.ad_spend_daily FROM authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ad_spend_daily[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('a leitura exige ser da empresa', () => {
    expect(sql).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.check_membership\(company_id\)\)/);
  });

  it('o relatório de custo passa pelo controle de acesso do relatório de anúncios', () => {
    expect(sql).toMatch(/exigir_acesso_a_empresa\(p_company_id\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.relatorio_de_custo\(uuid, timestamptz\) FROM PUBLIC, anon/);
  });

  it('mantém o anúncio que gastou e não trouxe lead (full outer join)', () => {
    expect(sql).toMatch(/FULL OUTER JOIN gasto/);
  });

  it('as ações de configuração exigem dono/administrador e a empresa vem do servidor', () => {
    expect(funcoes).toMatch(/podeAdministrar\(role\)/);
    expect(funcoes).not.toMatch(/companyId: z\./);
    // as três ações que mexem em conta/gasto pedem administrador
    expect((funcoes.match(/contexto\(admin, context\.userId, true\)/g) ?? []).length).toBe(3);
  });

  it('só aceita conta que o próprio token enxerga e em formato act_<número>', () => {
    expect(funcoes).toMatch(/act_\\d\+/);
    expect(funcoes).toMatch(/acessiveis\.contas\.find/);
  });

  it('o cron exige o segredo', () => {
    expect(cron).toMatch(/autorizarCron\(request\)/);
  });
});

describe('régua de qualificado', () => {
  const m = readFileSync('supabase/migrations/20261031200000_perdido_nao_qualifica.sql', 'utf8');
  it('lead perdido não conta como qualificado e a migration aborta sem a âncora', () => {
    expect(m).toMatch(/st\.kind <> ''lost''/);
    expect(m).toMatch(/RAISE EXCEPTION 'relatorio_anuncios/);
  });
});

describe('etapa de qualificação explícita', () => {
  const m = readFileSync('supabase/migrations/20261031300000_etapa_de_qualificacao.sql', 'utf8');
  const servico = readFileSync('src/modules/crm/services/stageService.ts', 'utf8');

  it('só uma etapa por empresa e só dono/administrador troca', () => {
    expect(m).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS stages_um_corte_por_empresa[\s\S]*WHERE is_qualified_cut/);
    expect(m).toMatch(/eh_admin_da_empresa\(p_company_id\)/);
    expect(m).toMatch(/REVOKE ALL ON FUNCTION public\.definir_etapa_de_qualificacao\(uuid, uuid\) FROM PUBLIC, anon/);
  });
  it('a marca vale antes da regra antiga nas duas funções, e a migration aborta sem a âncora', () => {
    expect(m).toMatch(/ARRAY\['relatorio_anuncios', 'resumo_analytics'\]/);
    expect(m).toMatch(/q\.is_qualified_cut\), min\(s\.order_index\)/);
    expect(m).toMatch(/RAISE EXCEPTION '%: trecho da régua não encontrado/);
  });
  it('a tela troca a marca pela função do banco, não por escritas soltas', () => {
    expect(servico).toMatch(/rpc\('definir_etapa_de_qualificacao'/);
  });
});
