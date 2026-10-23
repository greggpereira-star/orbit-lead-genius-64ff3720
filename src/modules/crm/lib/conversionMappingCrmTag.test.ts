import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = { op: string; tabela: string; dado?: Record<string, unknown>; filtros: unknown[][] };
const chamadas: Chamada[] = [];
let erroDoBanco: { code?: string; message: string } | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const c: Chamada = { op: '', tabela, filtros: [] };
      chamadas.push(c);
      const q: any = {
        upsert: (dado: Record<string, unknown>) => ((c.op = 'upsert'), (c.dado = dado), q),
        delete: () => ((c.op = 'delete'), q),
        eq: (...a: unknown[]) => (c.filtros.push(a), q),
        then: (r: (v: unknown) => unknown) => r({ error: erroDoBanco }),
      };
      return q;
    },
  },
}));

import { SO_MEDIR, salvarConversionMapping } from '../services/conversionMappingService';

const base = { companyId: 'c1', stageId: 's1', whatsappLabel: null, sendDealValue: false };

beforeEach(() => {
  chamadas.length = 0;
  erroDoBanco = null;
});

describe('etiqueta do CRM no mapeamento de conversão', () => {
  it('grava a etiqueta (aparada) junto do evento', async () => {
    await salvarConversionMapping({ ...base, metaEventName: 'QualifiedLead', crmTag: '  qualificado ' });
    expect(chamadas[0]).toMatchObject({ op: 'upsert', tabela: 'stage_conversion_mappings' });
    expect(chamadas[0].dado).toMatchObject({ meta_event_name: 'QualifiedLead', crm_tag: 'qualificado' });
  });

  it('em "Só medir" também mantém a etiqueta (a etapa continua sendo conversão no relatório)', async () => {
    await salvarConversionMapping({ ...base, metaEventName: SO_MEDIR, crmTag: 'visita' });
    expect(chamadas[0].dado).toMatchObject({ meta_event_name: null, crm_tag: 'visita' });
  });

  it('sem etiqueta grava null (e apagar o campo apaga a ligação)', async () => {
    await salvarConversionMapping({ ...base, metaEventName: 'Schedule', crmTag: '   ' });
    expect(chamadas[0].dado).toMatchObject({ crm_tag: null });
    chamadas.length = 0;
    await salvarConversionMapping({ ...base, metaEventName: 'Schedule' });
    expect(chamadas[0].dado).toMatchObject({ crm_tag: null });
  });

  it('sem evento a linha inteira é apagada: etiqueta sozinha não cria etapa de conversão', async () => {
    await salvarConversionMapping({ ...base, metaEventName: null, crmTag: 'qualificado' });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].op).toBe('delete');
  });

  it('etiqueta repetida em outra etapa vira mensagem em português', async () => {
    erroDoBanco = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "stage_conv_map_crm_tag_uniq" (crm_tag)',
    };
    await expect(
      salvarConversionMapping({ ...base, metaEventName: 'Schedule', crmTag: 'visita' }),
    ).rejects.toThrow('já leva a outra etapa');
  });

  it('outro erro do banco passa como veio', async () => {
    erroDoBanco = { code: '42501', message: 'permission denied' };
    await expect(
      salvarConversionMapping({ ...base, metaEventName: 'Schedule', crmTag: 'visita' }),
    ).rejects.toThrow('permission denied');
  });
});
