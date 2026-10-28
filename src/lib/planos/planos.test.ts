import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECURSOS, estaIncluido, textoDoValor } from './recursos';
import { RecursoIndisponivelError, exigirRecurso, limiteDoRecurso, temRecurso } from '../planos.server';

const sql = readFileSync('supabase/migrations/20261101100000_planos_e_recursos.sql', 'utf8');
const fn = readFileSync('src/lib/planos.functions.ts', 'utf8');

const adminCom = (resposta: { data?: unknown; error?: unknown }) => ({ rpc: async () => resposta });

describe('catálogo de recursos', () => {
  it('incluído = true ou limite maior que zero; ausente não está incluído', () => {
    expect(estaIncluido(true)).toBe(true);
    expect(estaIncluido(500)).toBe(true);
    expect(estaIncluido(0)).toBe(false);
    expect(estaIncluido(false)).toBe(false);
    expect(estaIncluido(null)).toBe(false);
    expect(estaIncluido(undefined)).toBe(false);
  });
  it('rótulos', () => {
    const limite = RECURSOS.find((r) => r.chave === 'ia_limite_mensal')!;
    expect(textoDoValor(limite, 5000)).toBe('5.000');
    expect(textoDoValor(limite, 0)).toBe('—');
    const api = RECURSOS.find((r) => r.chave === 'api_publica')!;
    expect(textoDoValor(api, true)).toBe('Incluído');
    expect(textoDoValor(api, undefined)).toBe('Não incluído');
  });
  it('chaves únicas', () => {
    const chaves = RECURSOS.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('trava no servidor', () => {
  it('libera só quando o banco responde true', async () => {
    expect(await temRecurso(adminCom({ data: true }), 'c', 'api_publica')).toBe(true);
    expect(await temRecurso(adminCom({ data: false }), 'c', 'api_publica')).toBe(false);
    expect(await temRecurso(adminCom({ data: null }), 'c', 'api_publica')).toBe(false);
  });
  it('erro de banco NEGA — nunca vira recurso liberado', async () => {
    expect(await temRecurso(adminCom({ error: { message: 'x' } }), 'c', 'api_publica')).toBe(false);
    await expect(exigirRecurso(adminCom({ error: { message: 'x' } }), 'c', 'ia_classificacao')).rejects.toBeInstanceOf(RecursoIndisponivelError);
  });
  it('exigirRecurso carrega a chave negada', async () => {
    await expect(exigirRecurso(adminCom({ data: false }), 'c', 'api_publica')).rejects.toMatchObject({ chave: 'api_publica' });
  });
  it('limite: número ou zero', async () => {
    expect(await limiteDoRecurso(adminCom({ data: 500 }), 'c', 'ia_limite_mensal')).toBe(500);
    expect(await limiteDoRecurso(adminCom({ data: true }), 'c', 'ia_limite_mensal')).toBe(0);
    expect(await limiteDoRecurso(adminCom({ error: {} }), 'c', 'ia_limite_mensal')).toBe(0);
  });
});

describe('migration de planos', () => {
  it('navegador não escreve nas tabelas nem atribui plano', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.plans, public\.company_plans FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.definir_plano_da_empresa[^;]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/IF NOT public\.chamada_de_servidor\(\)/);
  });
  it('as consultas passam pelo controle de acesso à empresa', () => {
    expect((sql.match(/PERFORM public\.exigir_acesso_a_empresa\(p_company_id\)/g) ?? []).length).toBe(2);
  });
  it('quem já existia é mantido no plano mais alto, sem tirar nada', () => {
    expect(sql).toMatch(/SELECT c\.id, 'escala', 'Anterior à criação dos planos'/);
  });
  it('sem linha, suspenso ou teste vencido caem no plano-base', () => {
    expect(sql).toMatch(/cp\.status = 'suspenso'/);
    expect(sql).toMatch(/cp\.teste_ate < now\(\)/);
    expect(sql).toMatch(/v_plano := 'essencial'/);
  });
  it('a empresa da tela vem do vínculo do usuário, não de parâmetro', () => {
    expect(fn).toMatch(/papelNaEmpresa\(admin, context\.userId\)/);
    expect(fn).not.toMatch(/z\.object/);
  });
});
