import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/lib/google-ads.functions.ts', 'utf8');

describe('google-ads.functions — acesso por empresa', () => {
  const corpo = (nome: string) => {
    const i = src.indexOf(`export const ${nome}`);
    const f = src.indexOf('export const', i + 10);
    return src.slice(i, f === -1 ? undefined : f);
  };

  it('salvar a conversão exige administrador da empresa informada', () => {
    expect(corpo('salvarConversaoGoogle')).toMatch(/exigirPapel\([^)]*data\.companyId, 'administrar'\)/);
  });
  it('gravar valor e enviar venda exigem acesso à empresa do lead', () => {
    expect(corpo('salvarValorDaVenda')).toMatch(/empresaDoLead\(supabaseAdmin, data\.leadId\), 'atender'/);
    expect(corpo('enviarConversaoVenda')).toMatch(/empresaDoLead\(supabaseAdmin, data\.leadId\), 'atender'/);
  });
  it('a conferência vem antes de qualquer escrita', () => {
    const c = corpo('salvarConversaoGoogle');
    expect(c.indexOf('exigirPapel(')).toBeLessThan(c.indexOf('.upsert('));
  });
});
