/**
 * Pipeline de leads em colunas arrastáveis.
 *
 * Até aqui este board lia `leads.stage_id`, que nenhum caminho de criação
 * gravava — as seis colunas apareciam vazias com 106 leads no banco. Agora a
 * tabela `stages` é a fonte da verdade e toda movimentação passa pelo
 * `stageService`, que grava etapa, ordem, carimbo de tempo e histórico juntos.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import {
  GripVertical, MessageCircle, MapPin, Radio, AlertCircle,
  Inbox, RefreshCw,
} from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listLeads, type LeadRow } from '../services/leadService';
import {
  listStages, moveLeadToStage, orderBetween, type Stage,
} from '../services/stageService';
import {
  getLeadCity, getLeadOrigin, channelLabel, toTitleCase, whatsappLink, relativeTime,
} from '../lib/leadFields';
import { getLeadDisplayName } from '../services/leadService';
import { LeadDetailDialog } from './LeadDetailDialog';

/**
 * Coluna sintética para leads sem etapa.
 *
 * Não deveria haver nenhum depois do backfill, mas uma etapa excluída fora do
 * app deixaria leads órfãos. Preferimos mostrá-los numa coluna esquisita a
 * deixá-los sumir da tela, que foi o defeito original.
 */
const NO_STAGE = '__sem_etapa__';

interface Props {
  /** Restringe o board aos leads de um quiz — usado na tela do funil. */
  quizId?: string;
  /** Rótulo configurável: "Empreendimento" numa imobiliária, "Curso" numa escola. */
  originLabel?: string;
  search?: string;
}

interface Column {
  id: string;
  title: string;
  color: string;
  leads: LeadRow[];
}

/**
 * Lead sem ordem definida vai pro TOPO, não pro fim.
 *
 * Antes caía em MAX_SAFE_INTEGER e afundava: o lead que acabou de chegar
 * aparecia no pé de uma coluna de 100 cards, que é o oposto do que o pipeline
 * serve pra fazer. Quem não tem posição é justamente quem acabou de entrar.
 */
const UNSORTED = -Number.MAX_SAFE_INTEGER;

function boardOrderOf(lead: LeadRow): number {
  const v = (lead as { board_order?: number | null }).board_order;
  return typeof v === 'number' ? v : UNSORTED;
}

/** Empate (dois sem ordem) resolve pelo mais recente primeiro. */
function compareForBoard(a: LeadRow, b: LeadRow): number {
  const diff = boardOrderOf(a) - boardOrderOf(b);
  if (diff !== 0) return diff;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function stageIdOf(lead: LeadRow): string | null {
  return (lead as { stage_id?: string | null }).stage_id ?? null;
}

/** Há quanto tempo o lead está parado nesta etapa — o sinal de que travou. */
function timeInStage(lead: LeadRow): string {
  const entered = (lead as { stage_entered_at?: string | null }).stage_entered_at;
  return relativeTime(entered ?? lead.created_at);
}

export function KanbanBoard({ quizId, originLabel = 'Origem', search = '' }: Props) {
  const { company } = useAuth();
  const qc = useQueryClient();
  const companyId = company?.id ?? '';
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);

  const stagesQuery = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId),
  });

  const leadsQuery = useQuery({
    queryKey: ['leads', companyId, 'board'],
    queryFn: () => listLeads(companyId),
    enabled: Boolean(companyId),
  });

  const stages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);

  const columns = useMemo<Column[]>(() => {
    const all = leadsQuery.data ?? [];
    const term = search.trim().toLowerCase();

    const visible = all.filter((l) => {
      if (quizId && (l as { quiz_id?: string | null }).quiz_id !== quizId) return false;
      if (!term) return true;
      const haystack = [l.name, l.email, l.phone, getLeadOrigin(l)]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });

    const byStage = (id: string | null) =>
      visible
        .filter((l) => stageIdOf(l) === id)
        .sort(compareForBoard);

    const known = new Set(stages.map((s) => s.id));
    const orphans = visible.filter((l) => {
      const sid = stageIdOf(l);
      return !sid || !known.has(sid);
    });

    const real: Column[] = stages.map((s) => ({
      id: s.id,
      title: s.name,
      color: s.color,
      leads: byStage(s.id),
    }));

    // A coluna de órfãos só existe quando há órfãos — uma coluna permanente
    // vazia viraria ruído em todo board saudável.
    return orphans.length
      ? [{ id: NO_STAGE, title: 'Sem etapa', color: '#94a3b8', leads: orphans }, ...real]
      : real;
  }, [leadsQuery.data, stages, quizId, search]);

  const moveMutation = useMutation({
    mutationFn: (v: {
      leadId: string; stageId: string; boardOrder: number;
      fromStageName: string; toStageName: string;
    }) =>
      moveLeadToStage({
        leadId: v.leadId,
        stageId: v.stageId,
        boardOrder: v.boardOrder,
        fromStageName: v.fromStageName,
        toStageName: v.toStageName,
        stages,
      }),
    onError: (e: Error) => {
      toast.error(`Não foi possível mover: ${e.message}`);
      // Desfaz o movimento otimista buscando o estado real do servidor.
      qc.invalidateQueries({ queryKey: ['leads', companyId, 'board'] });
    },
    onSuccess: () => {
      // A tabela de Leads e a ficha mostram a mesma etapa; precisam acompanhar.
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }
    // "Sem etapa" é diagnóstico, não destino: mover um lead PARA lá seria
    // escondê-lo de novo.
    if (destination.droppableId === NO_STAGE) {
      toast.info('"Sem etapa" é só um aviso. Escolha uma etapa do funil.');
      return;
    }

    const from = columns.find((c) => c.id === source.droppableId);
    const to = columns.find((c) => c.id === destination.droppableId);
    if (!from || !to) return;

    // Vizinhos no destino, já sem o card que está sendo movido.
    const destLeads = to.leads.filter((l) => l.id !== draggableId);
    const before = destLeads[destination.index - 1];
    const after = destLeads[destination.index];
    const boardOrder = orderBetween(
      before ? boardOrderOf(before) : null,
      after ? boardOrderOf(after) : null,
    );

    // Update otimista: arrastar precisa parecer instantâneo. O onError acima
    // reverte buscando o servidor se a gravação falhar.
    qc.setQueryData<LeadRow[]>(['leads', companyId, 'board'], (prev) =>
      (prev ?? []).map((l) =>
        l.id === draggableId
          ? ({ ...l, stage_id: to.id, board_order: boardOrder } as LeadRow)
          : l,
      ),
    );

    moveMutation.mutate({
      leadId: draggableId,
      stageId: to.id,
      boardOrder,
      fromStageName: from.title,
      toStageName: to.title,
    });
  };

  // ---------- estados ----------

  if (stagesQuery.isError || leadsQuery.isError) {
    const err = (stagesQuery.error ?? leadsQuery.error) as Error | undefined;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <div>
          <p className="font-medium">Não foi possível carregar o pipeline.</p>
          <p className="text-sm text-muted-foreground">{err?.message}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            stagesQuery.refetch();
            leadsQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (stagesQuery.isLoading || leadsQuery.isLoading) {
    return (
      <div className="flex h-full gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex w-80 shrink-0 flex-col gap-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!stages.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/40" />
        <p className="font-medium">Seu funil ainda não tem etapas.</p>
        <p className="text-sm text-muted-foreground">
          Use "Gerenciar etapas" para criar a primeira coluna.
        </p>
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex h-full gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <section key={column.id} className="flex w-80 shrink-0 flex-col">
              {/* A cor da etapa vive numa barra fina no topo, não no fundo da
                  coluna: seis fundos coloridos competiriam com os cards, que
                  são o conteúdo. */}
              <div
                className="h-1 rounded-full"
                style={{ backgroundColor: column.color }}
                aria-hidden="true"
              />
              <header className="flex items-center justify-between px-1 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-sm font-semibold tracking-tight">{column.title}</h3>
                  <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px] tabular-nums">
                    {column.leads.length}
                  </Badge>
                </div>
              </header>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    aria-label={`Etapa ${column.title}, ${column.leads.length} leads`}
                    className={`flex-1 space-y-2.5 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors ${
                      snapshot.isDraggingOver
                        ? 'border-primary/40 bg-primary/[0.04]'
                        : 'border-border/50 bg-muted/20'
                    }`}
                  >
                    {column.leads.length === 0 && !snapshot.isDraggingOver && (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
                        Arraste um lead para cá
                      </p>
                    )}

                    {column.leads.map((lead, index) => {
                      const name = toTitleCase(getLeadDisplayName(lead)) || getLeadDisplayName(lead);
                      const city = getLeadCity(lead);
                      const origin = getLeadOrigin(lead);
                      const wa = whatsappLink(lead.phone);
                      const parked = timeInStage(lead);

                      return (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              onDoubleClick={() => setDetailLead(lead)}
                              className={`rounded-xl border bg-card p-3 transition-shadow ${
                                dragSnapshot.isDragging
                                  ? 'shadow-lg ring-2 ring-primary/40'
                                  : 'shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-primary/30'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {/* Alça sempre visível: era `opacity-0
                                    group-hover`, ou seja, inexistente no toque. */}
                                <span
                                  {...dragProvided.dragHandleProps}
                                  aria-label={`Mover ${name}`}
                                  className="mt-0.5 cursor-grab rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </span>

                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => setDetailLead(lead)}
                                    className="block w-full truncate text-left text-sm font-semibold tracking-tight hover:text-primary focus-visible:outline-none focus-visible:underline"
                                  >
                                    {name}
                                  </button>
                                  {origin && (
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${originLabel}: ${origin}`}>
                                      {origin}
                                    </p>
                                  )}
                                </div>

                                {wa && (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                                    title="Abrir no WhatsApp"
                                  >
                                    <a
                                      href={wa}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                      <span className="sr-only">Abrir conversa no WhatsApp</span>
                                    </a>
                                  </Button>
                                )}
                              </div>

                              {/* Cidade e canal são o que muda a abordagem da
                                  ligação. Score e temperatura saíram: são 0 e
                                  NULL em todos os leads, não há IA que os
                                  calcule. */}
                              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px] text-muted-foreground">
                                {city && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {city.label}
                                  </span>
                                )}
                                {lead.source && (
                                  <span className="flex items-center gap-1">
                                    <Radio className="h-3 w-3" />
                                    {channelLabel(lead.source)}
                                  </span>
                                )}
                                {parked && <span className="ml-auto tabular-nums">{parked}</span>}
                              </div>
                            </article>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          ))}
        </div>
      </DragDropContext>

      <LeadDetailDialog
        lead={detailLead}
        open={detailLead !== null}
        onOpenChange={(o) => !o && setDetailLead(null)}
        originLabel={originLabel}
        onStatusChange={() => qc.invalidateQueries({ queryKey: ['leads'] })}
      />
    </>
  );
}
