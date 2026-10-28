import { describe, expect, it } from 'vitest';
import { fatiarJanela, hojeNoBrasil, janelaDeDatas, normalizarInsight } from './insights';
import { totaisDeCusto, type LinhaDeCusto } from '@/modules/analytics/services/adIntelligenceService';

describe('normalizarInsight', () => {
  const base = { ad_id: '1', ad_name: 'A', date_start: '2026-10-20', spend: '12.345', impressions: '1000', clicks: '40', account_currency: 'brl' };

  it('converte texto em número e arredonda o gasto para centavos', () => {
    expect(normalizarInsight(base)).toMatchObject({ ad_id: '1', dia: '2026-10-20', gasto: 12.35, impressoes: 1000, cliques: 40, moeda: 'BRL' });
  });

  it('descarta linha sem anúncio, sem dia válido ou sem gasto numérico', () => {
    expect(normalizarInsight({ ...base, ad_id: undefined })).toBeNull();
    expect(normalizarInsight({ ...base, date_start: '20/10/2026' })).toBeNull();
    expect(normalizarInsight({ ...base, spend: undefined })).toBeNull();
    expect(normalizarInsight({ ...base, spend: 'abc' })).toBeNull();
    expect(normalizarInsight({ ...base, spend: '-3' })).toBeNull();
  });

  it('impressões e cliques ausentes viram zero, mas o gasto zero é aceito', () => {
    expect(normalizarInsight({ ad_id: '1', date_start: '2026-10-20', spend: '0' })).toMatchObject({ gasto: 0, impressoes: 0, cliques: 0, moeda: 'BRL' });
  });
});

describe('janelas de datas', () => {
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 01:00 UTC de 28/10 ainda é 22:00 de 27/10 em São Paulo.
    expect(hojeNoBrasil(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-27');
  });

  it('a janela de N dias inclui hoje', () => {
    expect(janelaDeDatas(7, new Date('2026-10-28T15:00:00Z'))).toEqual({ desde: '2026-10-22', ate: '2026-10-28' });
    expect(janelaDeDatas(1, new Date('2026-10-28T15:00:00Z'))).toEqual({ desde: '2026-10-28', ate: '2026-10-28' });
  });

  it('fatia sem buraco nem sobreposição', () => {
    const f = fatiarJanela('2026-08-01', '2026-10-28', 30);
    expect(f[0].desde).toBe('2026-08-01');
    expect(f[f.length - 1].ate).toBe('2026-10-28');
    for (let i = 1; i < f.length; i++) {
      const anterior = Date.parse(`${f[i - 1].ate}T00:00:00Z`);
      expect(Date.parse(`${f[i].desde}T00:00:00Z`) - anterior).toBe(86400000);
    }
  });
});

describe('totaisDeCusto', () => {
  const linha = (o: Partial<LinhaDeCusto>): LinhaDeCusto => ({
    ad_id: 'x', ad_name: 'x', campanha: 'c', rede: 'meta', conversas: 0, qualificados: 0, taxa_qualificacao: null,
    valor_total: 0, dias_ate_qualificar: null, gasto: null, impressoes: null, cliques: null, moeda: null,
    custo_por_lead: null, custo_por_qualificado: null, roas: null, ...o,
  });

  it('é nulo sem nenhum gasto importado — não diz que custou zero', () => {
    expect(totaisDeCusto([linha({ conversas: 5 })])).toBeNull();
  });

  it('o custo geral divide pelo total de leads, inclusive os sem anúncio', () => {
    const t = totaisDeCusto([
      linha({ gasto: 100, conversas: 4, qualificados: 2, valor_total: 300 }),
      linha({ ad_id: '(sem anúncio)', conversas: 6 }),
    ])!;
    expect(t.custoPorLeadGeral).toBe(10);
    expect(t.custoPorQualificadoGeral).toBe(50);
    expect(t.roasGeral).toBe(3);
  });

  it('soma o gasto de anúncio que não trouxe lead', () => {
    const t = totaisDeCusto([linha({ gasto: 40, conversas: 0 }), linha({ gasto: 60, conversas: 3 })])!;
    expect(t.gastoSemLead).toBe(40);
    expect(t.gasto).toBe(100);
  });
});
