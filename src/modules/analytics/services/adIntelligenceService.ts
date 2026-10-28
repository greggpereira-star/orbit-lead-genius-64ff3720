/**
 * Inteligência de anúncios.
 *
 * A pergunta da mídia não é "qual anúncio traz conversa", é "qual traz conversa
 * que vira cliente". Dois anúncios com o mesmo custo por conversa podem ter
 * qualidade oposta.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LinhaAnuncio {
  ad_id: string;
  ad_name: string;
  campanha: string;
  rede: string;
  conversas: number;
  qualificados: number;
  /** `null` quando não há régua configurada — diferente de zero. */
  taxa_qualificacao: number | null;
  valor_total: number;
  dias_ate_qualificar: number | null;
}

export async function relatorioAnuncios(
  companyId: string,
  dias = 90,
): Promise<LinhaAnuncio[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc('relatorio_anuncios', {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaAnuncio[];
}

/**
 * Nomes de anúncio se repetem: o cliente duplica criativo entre campanhas e
 * conjuntos. Sem desempatar, a tabela mostra duas linhas iguais e parece bug.
 */
export function marcarNomesRepetidos<T extends LinhaAnuncio>(linhas: T[]): Array<T & { repetido: boolean }> {
  const contagem = new Map<string, number>();
  for (const l of linhas) contagem.set(l.ad_name, (contagem.get(l.ad_name) ?? 0) + 1);
  return linhas.map((l) => ({ ...l, repetido: (contagem.get(l.ad_name) ?? 0) > 1 }));
}

/** Linha do relatório com custo. Os custos são `null` quando não há como calcular — nunca zero. */
export interface LinhaDeCusto extends LinhaAnuncio {
  gasto: number | null;
  impressoes: number | null;
  cliques: number | null;
  moeda: string | null;
  custo_por_lead: number | null;
  custo_por_qualificado: number | null;
  /** ROAS = valor das VENDAS ganhas do anúncio ÷ gasto. Não é o valor do pipeline. */
  roas: number | null;
  /** Leads do período hoje em etapa de ganho, e o valor deles. */
  vendas: number;
  valor_ganho: number;
}

export async function relatorioDeCusto(companyId: string, dias = 90): Promise<LinhaDeCusto[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc('relatorio_de_custo', {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  // O Postgres devolve numeric como texto em alguns caminhos; a tela faz conta.
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...(r as unknown as LinhaAnuncio),
    conversas: Number(r.conversas),
    qualificados: Number(r.qualificados),
    taxa_qualificacao: n(r.taxa_qualificacao),
    valor_total: Number(r.valor_total ?? 0),
    dias_ate_qualificar: n(r.dias_ate_qualificar),
    gasto: n(r.gasto),
    impressoes: n(r.impressoes),
    cliques: n(r.cliques),
    moeda: (r.moeda as string | null) ?? null,
    custo_por_lead: n(r.custo_por_lead),
    custo_por_qualificado: n(r.custo_por_qualificado),
    roas: n(r.roas),
    vendas: Number(r.vendas ?? 0),
    valor_ganho: Number(r.valor_ganho ?? 0),
  }));
}

export interface TotaisDeCusto {
  gasto: number;
  leads: number;
  qualificados: number;
  /** Valor dos leads QUALIFICADOS (pipeline). Não entra no ROAS. */
  valor: number;
  /** Vendas ganhas e o valor delas — a base do ROAS. */
  vendas: number;
  valorGanho: number;
  /** Gasto total / todos os leads do período, inclusive os sem anúncio identificado. */
  custoPorLeadGeral: number | null;
  custoPorQualificadoGeral: number | null;
  roasGeral: number | null;
  /** Gasto de anúncios que não trouxeram nenhum lead no período. */
  gastoSemLead: number;
}

/**
 * Totais do período.
 *
 * O custo por lead GERAL divide pelo total de leads (inclusive os sem anúncio
 * identificado), enquanto o da linha divide só pelos leads atribuídos àquele
 * anúncio. Os dois diferem de propósito: a soma das linhas não reproduz o geral
 * quando há lead sem atribuição, e a tela diz isso.
 */
export function totaisDeCusto(linhas: LinhaDeCusto[]): TotaisDeCusto | null {
  const comGasto = linhas.filter((l) => l.gasto !== null);
  if (comGasto.length === 0) return null;
  const gasto = comGasto.reduce((a, l) => a + (l.gasto ?? 0), 0);
  const leads = linhas.reduce((a, l) => a + l.conversas, 0);
  const qualificados = linhas.reduce((a, l) => a + l.qualificados, 0);
  const valor = linhas.reduce((a, l) => a + l.valor_total, 0);
  const vendas = linhas.reduce((a, l) => a + l.vendas, 0);
  const valorGanho = linhas.reduce((a, l) => a + l.valor_ganho, 0);
  return {
    gasto,
    leads,
    qualificados,
    valor,
    vendas,
    valorGanho,
    custoPorLeadGeral: leads > 0 ? gasto / leads : null,
    custoPorQualificadoGeral: qualificados > 0 ? gasto / qualificados : null,
    // Retorno é VENDA: valor das vendas ganhas ÷ gasto. Valor de lead qualificado é pipeline.
    roasGeral: gasto > 0 && valorGanho > 0 ? valorGanho / gasto : null,
    gastoSemLead: comGasto.filter((l) => l.conversas === 0).reduce((a, l) => a + (l.gasto ?? 0), 0),
  };
}
