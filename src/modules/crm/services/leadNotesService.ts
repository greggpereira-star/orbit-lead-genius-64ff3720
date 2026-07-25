/**
 * Anotações, agendamentos e etiquetas de um lead.
 *
 * Anotação e agendamento moram na mesma tabela: o que os separa é ter ou não
 * `scheduled_for`. Isso mantém o histórico do lead em ordem cronológica única,
 * que é como o corretor lê — e evita duas estruturas quase idênticas.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LeadNote {
  id: string;
  lead_id: string;
  company_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  scheduled_for: string | null;
  done: boolean;
  created_at: string;
}

export interface CreateNoteInput {
  companyId: string;
  leadId: string;
  body: string;
  /** ISO. Preenchido = compromisso marcado (visita, consulta, reunião). */
  scheduledFor?: string | null;
  authorId: string | null;
  authorName: string | null;
}

export async function listLeadNotes(leadId: string): Promise<LeadNote[]> {
  const { data, error } = await (supabase as any)
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadNote[];
}

export async function createLeadNote(input: CreateNoteInput): Promise<LeadNote> {
  const body = input.body.trim();
  if (!body) throw new Error('Escreva algo antes de salvar.');

  const { data, error } = await (supabase as any)
    .from('lead_notes')
    .insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      author_id: input.authorId,
      author_name: input.authorName,
      body,
      scheduled_for: input.scheduledFor || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as LeadNote;
}

/** Marca o compromisso como cumprido — some da lista de próximos. */
export async function toggleNoteDone(noteId: string, done: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('lead_notes')
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error(error.message);
}

export async function deleteLeadNote(noteId: string): Promise<void> {
  const { error } = await (supabase as any).from('lead_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------------
// Etiquetas
// -------------------------------------------------------------------

export interface LeadTag {
  id: string;
  lead_id: string;
  tag_name: string;
}

export async function listLeadTags(leadId: string): Promise<LeadTag[]> {
  const { data, error } = await (supabase as any)
    .from('lead_tags')
    .select('id, lead_id, tag_name')
    .eq('lead_id', leadId)
    .order('tag_name');

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadTag[];
}

/**
 * Sugestões vêm das etiquetas já usadas na empresa: quem digita "Investidor"
 * hoje e "investidor" amanhã acaba com duas etiquetas diferentes pro mesmo
 * conceito, e a lista deixa de servir pra filtrar.
 */
export async function listCompanyTagNames(companyId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('lead_tags')
    .select('tag_name, leads!inner(company_id)')
    .eq('leads.company_id', companyId)
    .limit(500);

  if (error) return [];
  const names = new Set<string>();
  for (const row of (data ?? []) as { tag_name: string }[]) {
    if (row.tag_name) names.add(row.tag_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function addLeadTag(leadId: string, tagName: string): Promise<void> {
  const name = tagName.trim();
  if (!name) throw new Error('Digite o nome da etiqueta.');

  // upsert com o índice único (lead_id, tag_name): clicar duas vezes na mesma
  // sugestão não deve virar erro na cara do usuário.
  const { error } = await (supabase as any)
    .from('lead_tags')
    .upsert({ lead_id: leadId, tag_name: name }, { onConflict: 'lead_id,tag_name' });
  if (error) throw new Error(error.message);
}

export async function removeLeadTag(tagId: string): Promise<void> {
  const { error } = await (supabase as any).from('lead_tags').delete().eq('id', tagId);
  if (error) throw new Error(error.message);
}
