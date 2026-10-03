/**
 * Quem trabalha nesta empresa.
 *
 * Existe para o campo de responsável do lead: `leads.assigned_to` já estava no
 * banco e só o mapeamento de formulário da Meta escrevia nele. Medido em
 * 03/10/2026: 0 dos 489 leads tinham dono. Sem isso não há como perguntar
 * "quantos leads o João está segurando?" nem cobrar follow-up de alguém.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MembroDaEquipe {
  userId: string;
  nome: string;
  email: string | null;
  papel: string | null;
}

/**
 * Duas consultas em vez de um join embutido: `memberships.user_id` aponta para
 * `auth.users`, não para `profiles`, então o PostgREST não tem relação para
 * encadear. Pedir o join geraria erro em runtime, não em compilação.
 */
export async function listarMembrosDaEquipe(companyId: string): Promise<MembroDaEquipe[]> {
  const { data: vinculos, error } = await (supabase as any)
    .from('memberships')
    .select('user_id, role')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);

  const ids = (vinculos ?? []).map((v: { user_id: string }) => v.user_id);
  if (!ids.length) return [];

  const { data: perfis } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);

  const porId = new Map<string, { full_name: string | null; email: string | null }>(
    (perfis ?? []).map((p: { id: string; full_name: string | null; email: string | null }) =>
      [p.id, { full_name: p.full_name, email: p.email }]),
  );

  return (vinculos ?? [])
    .map((v: { user_id: string; role: string | null }) => {
      const p = porId.get(v.user_id);
      return {
        userId: v.user_id,
        // Sem nome preenchido, o e-mail identifica melhor que um uuid.
        nome: p?.full_name?.trim() || p?.email?.split('@')[0] || 'Sem nome',
        email: p?.email ?? null,
        papel: v.role,
      };
    })
    .sort((a: MembroDaEquipe, b: MembroDaEquipe) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
