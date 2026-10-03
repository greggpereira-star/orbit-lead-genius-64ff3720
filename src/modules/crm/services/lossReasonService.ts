/**
 * Motivos de perda da empresa.
 *
 * Lista própria por nicho, e não vem semeada: uma imobiliária perde por "achou
 * mais barato" e "não aprovou crédito"; uma clínica, por "preço" e "foi para o
 * convênio". Uma lista genérica seria ignorada ou preenchida errado, e motivo
 * preenchido errado é pior que motivo ausente — ele parece dado.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LossReason {
  id: string;
  company_id: string;
  label: string;
  order_index: number;
  is_active: boolean;
}

export async function listarMotivosDePerda(companyId: string): Promise<LossReason[]> {
  const { data, error } = await (supabase as any)
    .from('loss_reasons')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('order_index');
  if (error) throw new Error(error.message);
  return (data ?? []) as LossReason[];
}

export async function criarMotivoDePerda(companyId: string, label: string): Promise<void> {
  const nome = label.trim();
  if (!nome) throw new Error('Escreva o motivo.');

  const { data: ultimos } = await (supabase as any)
    .from('loss_reasons')
    .select('order_index')
    .eq('company_id', companyId)
    .order('order_index', { ascending: false })
    .limit(1);

  const { error } = await (supabase as any).from('loss_reasons').insert({
    company_id: companyId,
    label: nome,
    order_index: ((ultimos?.[0]?.order_index as number | undefined) ?? -1) + 1,
  });
  // O índice único é por nome e só entre os ativos. Traduzir aqui evita que a
  // pessoa veja o nome da constraint.
  if (error) {
    throw new Error(
      error.code === '23505' ? `Já existe um motivo chamado "${nome}".` : error.message,
    );
  }
}

/**
 * Desativa em vez de apagar: leads perdidos continuam apontando para o motivo,
 * e excluir reescreveria o passado deles — exatamente o que o histórico existe
 * para impedir.
 */
export async function desativarMotivoDePerda(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('loss_reasons').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function renomearMotivoDePerda(id: string, label: string): Promise<void> {
  const nome = label.trim();
  if (!nome) throw new Error('Escreva o motivo.');
  const { error } = await (supabase as any)
    .from('loss_reasons').update({ label: nome }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Preenche o motivo de um lead que já está perdido.
 *
 * Passa por RPC em vez de um update direto porque são duas escritas que
 * precisam andar juntas: a do lead e a de completar a linha do histórico. A
 * função também recusa lead de outra empresa e lead que não está em etapa de
 * perda — com SECURITY DEFINER a checagem tem que ser explícita.
 */
export async function definirMotivoDaPerda(
  leadId: string,
  reasonId: string,
  notes: string | null,
): Promise<void> {
  const { error } = await (supabase as any).rpc('definir_motivo_da_perda', {
    p_lead_id: leadId,
    p_reason_id: reasonId,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
}
