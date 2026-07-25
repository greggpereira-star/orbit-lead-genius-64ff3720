/**
 * Etapas do funil e movimentação de leads entre elas.
 *
 * A tabela `stages` é a fonte da verdade da etapa de um lead. `leads.status`
 * continua sendo gravado junto porque automações e o sync CV.CRM o leem, mas é
 * derivado daqui — nunca escrito sozinho. Por isso toda mudança de etapa no app
 * passa por `moveLeadToStage`: um ponto de escrita só, sem chance das duas
 * noções voltarem a divergir como divergiram antes (106 leads com `stage_id`
 * NULL e um pipeline vazio).
 */
import { supabase } from '@/integrations/supabase/client';

export type StageKind = 'open' | 'won' | 'lost';

export interface Stage {
  id: string;
  company_id: string;
  name: string;
  color: string;
  order_index: number;
  kind: StageKind;
  is_entry: boolean;
}

/** Espaço entre dois cards vizinhos na ordenação da coluna. */
const ORDER_GAP = 1000;

/** Cor padrão de etapa nova — a mesma que o banco usa como default. */
export const DEFAULT_STAGE_COLOR = '#3b82f6';

/**
 * Paleta oferecida ao usuário. Tons fortes o suficiente para distinguir uma
 * coluna da outra de relance, e que funcionam no tema claro e no escuro.
 */
export const STAGE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#64748b',
];

export async function listStages(companyId: string): Promise<Stage[]> {
  const { data, error } = await (supabase as any)
    .from('stages')
    .select('id, company_id, name, color, order_index, kind, is_entry')
    .eq('company_id', companyId)
    .order('order_index');

  if (error) throw new Error(error.message);
  return (data ?? []) as Stage[];
}

/**
 * Em que etapa um lead novo deve entrar.
 *
 * `preferred` vem da integração (quiz, formulário ou mapeamento do Meta). É
 * validado contra as etapas da empresa em vez de aceito de olhos fechados: a
 * etapa pode ter sido excluída depois de configurada, e um `stage_id` órfão
 * deixaria o lead invisível no board — exatamente o defeito que estamos
 * corrigindo.
 */
export function resolveEntryStage(
  stages: Stage[],
  preferred?: string | null,
): Stage | null {
  if (!stages.length) return null;
  if (preferred) {
    const match = stages.find((s) => s.id === preferred);
    if (match) return match;
  }
  return stages.find((s) => s.is_entry) ?? stages[0];
}

/**
 * `status` correspondente a uma etapa.
 *
 * Grosso de propósito. `status` é um campo legado de quatro valores fixos, e o
 * funil tem tamanho livre — mapear posição a posição dava resultado errado
 * assim que o cliente passava de quatro etapas abertas: com seis colunas,
 * "Visita agendada" virava `proposal` e "Proposta enviada" virava `contacted`,
 * invertidos.
 *
 * Então só afirma o que é sempre verdade: entrou agora, está em atendimento,
 * fechou ou perdeu. Quem quiser saber a etapa exata lê `stage_id`, que é a
 * fonte da verdade. Isto aqui existe só para automações e o sync CV.CRM não
 * quebrarem.
 */
function statusForStage(stage: Stage, stages: Stage[]): string {
  if (stage.kind === 'won') return 'won';
  if (stage.kind === 'lost') return 'lost';
  const firstOpen = stages.find((s) => s.kind === 'open');
  return firstOpen?.id === stage.id ? 'new' : 'contacted';
}

export interface MoveLeadInput {
  leadId: string;
  stageId: string;
  /** Ordem já calculada pelo board (ver `orderBetween`). */
  boardOrder: number;
  /** Só para o texto do histórico. */
  fromStageName?: string | null;
  toStageName?: string | null;
  stages: Stage[];
}

/**
 * Move um lead de etapa e registra no histórico.
 *
 * O evento em `lead_events` é o que permite depois medir quanto tempo o lead
 * levou em cada etapa. Falhar em gravá-lo não desfaz a movimentação — perder o
 * registro é ruim, perder o movimento que o usuário acabou de fazer é pior.
 */
export async function moveLeadToStage(input: MoveLeadInput): Promise<void> {
  const stage = input.stages.find((s) => s.id === input.stageId);
  if (!stage) throw new Error('Etapa não encontrada.');

  const { error } = await (supabase as any)
    .from('leads')
    .update({
      stage_id: input.stageId,
      board_order: input.boardOrder,
      stage_entered_at: new Date().toISOString(),
      status: statusForStage(stage, input.stages),
    })
    .eq('id', input.leadId);

  if (error) throw new Error(error.message);

  const from = input.fromStageName ?? 'Sem etapa';
  const to = input.toStageName ?? stage.name;
  if (from !== to) {
    await (supabase as any).from('lead_events').insert({
      lead_id: input.leadId,
      event_type: 'stage_change',
      description: `Movido de ${from} para ${to}`,
      metadata: { to_stage_id: input.stageId },
    });
  }
}

/**
 * Posição para um card solto entre dois vizinhos.
 *
 * A média entre os dois evita reescrever a coluna inteira a cada arrastar —
 * uma coluna com 80 leads faria 80 updates por movimento. Depois de muitas
 * inserções no mesmo ponto os valores se aproximam do limite do float; quando
 * isso acontece o board reespaça a coluna (ver `respaceColumn`).
 */
export function orderBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return ORDER_GAP;
  if (before == null) return (after as number) - ORDER_GAP;
  if (after == null) return before + ORDER_GAP;
  return (before + after) / 2;
}

/** Reespaça uma coluna quando as posições ficaram indistinguíveis. */
export async function respaceColumn(leadIds: string[]): Promise<void> {
  await Promise.all(
    leadIds.map((id, i) =>
      (supabase as any).from('leads').update({ board_order: (i + 1) * ORDER_GAP }).eq('id', id),
    ),
  );
}

// ---------------------------------------------------------------------------
// CRUD de etapas
// ---------------------------------------------------------------------------

export async function createStage(
  companyId: string,
  name: string,
  color = DEFAULT_STAGE_COLOR,
): Promise<Stage> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Dê um nome à etapa.');

  const existing = await listStages(companyId);
  const orderIndex = existing.length
    ? Math.max(...existing.map((s) => s.order_index)) + 1
    : 0;

  const { data, error } = await (supabase as any)
    .from('stages')
    .insert({
      company_id: companyId,
      name: trimmed,
      color,
      order_index: orderIndex,
      kind: 'open',
      // Primeira etapa da empresa vira a de entrada — sem isso, um funil
      // recém-criado não teria onde receber lead.
      is_entry: existing.length === 0,
    })
    .select('id, company_id, name, color, order_index, kind, is_entry')
    .single();

  if (error) throw new Error(error.message);
  return data as Stage;
}

export async function updateStage(
  stageId: string,
  patch: Partial<Pick<Stage, 'name' | 'color' | 'kind'>>,
): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error('O nome da etapa não pode ficar vazio.');
  }
  const { error } = await (supabase as any)
    .from('stages')
    .update({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
    .eq('id', stageId);

  if (error) throw new Error(error.message);
}

/**
 * Define a etapa de entrada.
 *
 * Duas escritas em vez de uma porque há índice único parcial em
 * `(company_id) WHERE is_entry` — marcar a nova antes de limpar a antiga
 * violaria a restrição.
 */
export async function setEntryStage(companyId: string, stageId: string): Promise<void> {
  const clear = await (supabase as any)
    .from('stages')
    .update({ is_entry: false })
    .eq('company_id', companyId)
    .eq('is_entry', true);
  if (clear.error) throw new Error(clear.error.message);

  const set = await (supabase as any)
    .from('stages')
    .update({ is_entry: true })
    .eq('id', stageId);
  if (set.error) throw new Error(set.error.message);
}

export async function reorderStages(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      (supabase as any).from('stages').update({ order_index: i }).eq('id', id),
    ),
  );
  const failed = results.find((r: any) => r.error);
  if (failed) throw new Error(failed.error.message);
}

/**
 * Exclui uma etapa, movendo os leads dela para outra.
 *
 * O destino é obrigatório de propósito. A FK é `ON DELETE SET NULL`, então
 * excluir sem realocar deixaria os leads com `stage_id` NULL — invisíveis no
 * board. É literalmente como os 106 leads sumiram.
 */
export async function deleteStage(stageId: string, moveLeadsToStageId: string): Promise<void> {
  if (stageId === moveLeadsToStageId) {
    throw new Error('Escolha uma etapa diferente para receber os leads.');
  }

  const moved = await (supabase as any)
    .from('leads')
    .update({ stage_id: moveLeadsToStageId, stage_entered_at: new Date().toISOString() })
    .eq('stage_id', stageId);
  if (moved.error) throw new Error(moved.error.message);

  const { error } = await (supabase as any).from('stages').delete().eq('id', stageId);
  if (error) throw new Error(error.message);
}
