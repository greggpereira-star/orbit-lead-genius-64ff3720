import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261031400000_estatisticas_dos_links.sql', 'utf8');
const rota = readFileSync('src/routes/ir.$slug.tsx', 'utf8');
const servico = readFileSync('src/modules/crm/services/redirectLinkService.ts', 'utf8');

describe('estatísticas dos links', () => {
  it('as duas funções barram quem não é da empresa e não ficam abertas', () => {
    expect((sql.match(/exigir_acesso_a_empresa\(/g) ?? []).length).toBe(2);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.estatisticas_dos_links\(uuid, timestamptz\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cliques_do_link_por_origem\(uuid, timestamptz\) FROM PUBLIC, anon/);
  });
  it('a origem do link é conferida pela empresa dele, não por um parâmetro do navegador', () => {
    expect(sql).toMatch(/SELECT r\.company_id INTO v_empresa FROM redirect_links r WHERE r\.id = p_link_id/);
    expect(sql).toMatch(/c\.company_id = v_empresa/);
  });
  it('lead que clicou duas vezes conta uma, e perdido não qualifica', () => {
    expect(sql).toMatch(/SELECT DISTINCT c\.link_id, l\.id AS lead_id/);
    expect(sql).toMatch(/d\.kind <> 'lost'/);
  });
  it('usa a etapa de qualificação da empresa antes da regra antiga', () => {
    expect(sql).toMatch(/q\.is_qualified_cut/);
  });
  it('a tela lê o funil do banco, não conta no navegador', () => {
    expect(servico).toMatch(/rpc\('estatisticas_dos_links'/);
  });
  it('robôs são redirecionados mas não gravam clique', () => {
    expect(rota).toMatch(/ehRobo\(/);
    expect(rota).toMatch(/if \(!robo\)/);
  });
});
