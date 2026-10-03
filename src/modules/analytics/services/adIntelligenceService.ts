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
export function marcarNomesRepetidos(linhas: LinhaAnuncio[]): Array<LinhaAnuncio & { repetido: boolean }> {
  const contagem = new Map<string, number>();
  for (const l of linhas) contagem.set(l.ad_name, (contagem.get(l.ad_name) ?? 0) + 1);
  return linhas.map((l) => ({ ...l, repetido: (contagem.get(l.ad_name) ?? 0) > 1 }));
}
