/**
 * Pipeline de leads em colunas arrastáveis.
 *
 * Até aqui este board lia `leads.stage_id`, que nenhum caminho de criação
 * gravava — as seis colunas apareciam vazias com 106 leads no banco. Agora a
 * tabela `stages` é a fonte da verdade e toda movimentação passa pelo
 * `stageService`, que grava etapa, ordem, carimbo de tempo e histórico juntos.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import {
  GripVertical, MessageCircle, MapPin, Radio, AlertCircle,
  Inbox, RefreshCw, Loader2, Trash2, ChevronLeft, ChevronRight, CornerUpRight, Check,
} from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { deleteLeads, listLeads, type LeadRow } from '../services/leadService';
import {
  listStages, moveLeadToStage, orderBetween, type Stage,
} from '../services/stageService';
import { LossReasonDialog } from '@/modules/crm/components/LossReasonDialog';
import {
  getLeadCity, getLeadOrigin, channelLabel, toTitleCase, whatsappLink, relativeTime,
} from '../lib/leadFields';
import { getLeadDisplayName } from '../services/leadService';
import { LeadDetailDialog } from './LeadDetailDialog';

/**
 * Corpo da coluna — a área tracejada que rola.
 *
 * Exportado porque a tela do quiz monta uma coluna própria ("Visitantes", que
 * não são leads e não entram no funil) e ela precisa parecer irmã das outras,
 * não uma peça de outro board.
 */
export function boardBodyClass(active = false): string {
  return `scrollbar-slim min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors ${
    active ? 'border-primary/40 bg-primary/[0.04]' : 'border-border/50 bg-muted/20'
  }`;
}

/** Casca da coluna: barra de cor, título, contagem e o corpo que rola. */
export function BoardColumn({
  title, color, count, headerExtra, children,
}: {
  title: string;
  color: string;
  count: number;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 w-80 shrink-0 flex-col">
      {/* A cor da etapa vive numa barra fina no topo, não no fundo da coluna:
          seis fundos coloridos competiriam com os cards, que são o conteúdo. */}
      <div className="h-1 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <header className="flex items-center justify-between px-1 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {headerExtra}
          <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px] tabular-nums">
            {count}
          </Badge>
        </div>
      </header>
      {children}
    </section>
  );
}

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
  /**
   * Mostra só os leads de uma origem — o empreendimento, na imobiliária.
   *
   * Filtro em vez de etapas separadas: as etapas medem em que ponto da
   * negociação o lead está, e usar uma para dizer de qual produto ele é
   * misturaria dois eixos. A separação sumiria no instante em que o lead
   * avançasse de coluna, e cada empreendimento novo viraria mais uma coluna
   * permanente no quadro.
   */
  origin?: string;
  /**
   * Modo seleção: o card ganha caixa e para de arrastar.
   *
   * Quem liga o modo é a página (o botão fica na barra junto de "Gerenciar
   * etapas"); o board cuida do resto. Sem um modo explícito não há onde
   * pendurar a caixa num kanban: no hover ela some no celular, e fixa no card
   * ela brigaria com o gesto de arrastar, que é a função principal da tela.
   */
  selecting?: boolean;
  onExitSelection?: () => void;
  /**
   * Coluna extra encaixada antes das etapas, na mesma faixa de rolagem.
   *
   * Serve pra tela do quiz mostrar "Visitantes" ao lado do funil: são
   * submissões sem lead, então não pertencem a etapa nenhuma e não podem
   * receber card arrastado.
   */
  leadingColumn?: ReactNode;
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

export function KanbanBoard({
  quizId, originLabel = 'Origem', search = '', origin = '', selecting = false, onExitSelection,
  leadingColumn,
}: Props) {
  const { company } = useAuth();
  const qc = useQueryClient();
  const companyId = company?.id ?? '';
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sair do modo não pode deixar seleção pendurada: ao voltar, o usuário
  // encontraria cards já marcados sem ter marcado nada.
  useEffect(() => {
    if (!selecting) setSelectedIds([]);
  }, [selecting]);

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
      if (origin && getLeadOrigin(l) !== origin) return false;
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
  }, [leadsQuery.data, stages, quizId, search, origin]);

  /**
   * Movimento que caiu numa etapa de perda e está esperando o motivo.
   *
   * O card já se moveu na tela — arrastar precisa parecer instantâneo — e o
   * diálogo pergunta por cima. Cancelar desfaz buscando o servidor.
   */
  const [perguntandoMotivo, setPerguntandoMotivo] = useState<{
    leadId: string; leadName: string; stageId: string; boardOrder: number;
    fromStageName: string; toStageName: string;
  } | null>(null);

  const moveMutation = useMutation({
    mutationFn: (v: {
      leadId: string; stageId: string; boardOrder: number;
      fromStageName: string; toStageName: string;
      lossReasonId?: string | null; lostNotes?: string | null;
    }) =>
      moveLeadToStage({
        leadId: v.leadId,
        stageId: v.stageId,
        boardOrder: v.boardOrder,
        fromStageName: v.fromStageName,
        toStageName: v.toStageName,
        lossReasonId: v.lossReasonId ?? null,
        lostNotes: v.lostNotes ?? null,
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

  /**
   * Conta só o que está na tela.
   *
   * Um lead selecionado pode sumir do board por refetch, filtro de busca ou
   * exclusão feita noutra aba. Contar pelos ids crus mostraria "3
   * selecionados" com dois cards visíveis — a barra tem que dizer a verdade.
   */
  const visibleSelected = useMemo(() => {
    const onBoard = new Set(columns.flatMap((c) => c.leads.map((l) => l.id)));
    return selectedIds.filter((id) => onBoard.has(id));
  }, [columns, selectedIds]);

  const toggleLead = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleColumn = (column: Column, checked: boolean) => {
    const ids = column.leads.map((l) => l.id);
    setSelectedIds((prev) =>
      checked
        ? [...prev, ...ids.filter((id) => !prev.includes(id))]
        : prev.filter((id) => !ids.includes(id)),
    );
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return deleteLeads({ leadIds: visibleSelected, companyId });
    },
    onSuccess: async (count) => {
      await qc.invalidateQueries({ queryKey: ['leads'] });
      setSelectedIds([]);
      setConfirmDelete(false);
      onExitSelection?.();
      toast.success(count === 1 ? '1 lead excluído' : `${count} leads excluídos`);
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível excluir os leads.'),
  });

  /* ---------- Navegação entre as colunas ----------
     Sete etapas a 20rem não cabem em tela nenhuma, e a barra fina embaixo do
     board é um alvo ruim: ela só aparece ao passar o mouse e fica longe de
     onde a mão está. As setas dão um destino previsível — uma coluna por
     clique — e o teclado alcança as duas. */
  const trilho = useRef<HTMLDivElement | null>(null);
  const [podeEsquerda, setPodeEsquerda] = useState(false);
  const [podeDireita, setPodeDireita] = useState(false);

  const medirTrilho = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    setPodeEsquerda(el.scrollLeft > 4);
    // 4px de folga: zoom de navegador deixa a conta com resto fracionário, e
    // sem a folga a seta da direita nunca apaga no fim do board.
    setPodeDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    medirTrilho();
    el.addEventListener('scroll', medirTrilho, { passive: true });
    const observador = new ResizeObserver(medirTrilho);
    observador.observe(el);
    return () => { el.removeEventListener('scroll', medirTrilho); observador.disconnect(); };
  }, [medirTrilho, columns.length]);

  /** Uma coluna por clique: 20rem do card mais 1rem do intervalo. */
  const deslizar = (direcao: -1 | 1) =>
    trilho.current?.scrollBy({ left: direcao * 21 * 16, behavior: 'smooth' });

  /* Deslize automático ao arrastar.
     A biblioteca rola sozinha quando o ponteiro chega à borda, mas a zona é
     estreita e no board inteiro ela quase não é alcançada — era por isso que
     levar um card até a última etapa não funcionava. Este laço escuta o
     ponteiro durante o arraste e rola proporcional à proximidade da borda:
     quanto mais perto, mais rápido. */
  const arrastando = useRef(false);
  useEffect(() => {
    let quadro = 0;
    let velocidade = 0;

    const girar = () => {
      if (velocidade !== 0) trilho.current?.scrollBy({ left: velocidade });
      quadro = requestAnimationFrame(girar);
    };

    const aoMover = (e: PointerEvent) => {
      const el = trilho.current;
      if (!el || !arrastando.current) { velocidade = 0; return; }
      const caixa = el.getBoundingClientRect();
      const ZONA = 140;
      const MAX = 22;
      if (e.clientX < caixa.left + ZONA) {
        velocidade = -MAX * ((caixa.left + ZONA - e.clientX) / ZONA);
      } else if (e.clientX > caixa.right - ZONA) {
        velocidade = MAX * ((e.clientX - (caixa.right - ZONA)) / ZONA);
      } else {
        velocidade = 0;
      }
    };

    window.addEventListener('pointermove', aoMover);
    quadro = requestAnimationFrame(girar);
    return () => { window.removeEventListener('pointermove', aoMover); cancelAnimationFrame(quadro); };
  }, []);

  /**
   * Muda a etapa pelo menu do card.
   *
   * Arrastar até a sétima coluna é um gesto longo e frágil — e impossível no
   * celular. O menu é o mesmo destino por outro caminho, e passa pela MESMA
   * regra: etapa de perda pergunta o motivo antes de gravar.
   */
  const moverPeloMenu = (lead: LeadRow, destino: Stage, origem: string) => {
    if (destino.kind === 'lost') {
      setPerguntandoMotivo({
        leadId: lead.id,
        leadName: (lead as { name?: string }).name || 'este lead',
        stageId: destino.id,
        // Topo da coluna: é onde um lead recém-mexido faz sentido estar, e o
        // menu não conhece a posição entre os vizinhos.
        boardOrder: 0,
        fromStageName: origem,
        toStageName: destino.name,
      });
      return;
    }
    moveMutation.mutate({
      leadId: lead.id,
      stageId: destino.id,
      boardOrder: 0,
      fromStageName: origem,
      toStageName: destino.name,
    });
  };

  const onDragEnd = (result: DropResult) => {
    arrastando.current = false;
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

    // Etapa de perda não grava direto: o motivo entra no MESMO update da
    // etapa, porque é dele que o gatilho de histórico lê. Gravar agora e
    // completar depois deixaria a linha do movimento sem motivo para sempre.
    const destino = stages.find((st) => st.id === to.id);
    if (destino?.kind === 'lost') {
      const lead = (leadsQuery.data ?? []).find((l) => l.id === draggableId);
      setPerguntandoMotivo({
        leadId: draggableId,
        leadName: (lead as { name?: string } | undefined)?.name || 'este lead',
        stageId: to.id,
        boardOrder,
        fromStageName: from.title,
        toStageName: to.title,
      });
      return;
    }

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
      <DragDropContext onDragStart={() => { arrastando.current = true; }} onDragEnd={onDragEnd}>
        {/* `min-h-0` nos dois níveis é o que faz a coluna rolar em vez de
            esticar: sem ele o item flex assume min-height:auto, cresce até
            caber todos os cards e empurra o board pra fora da tela — era por
            isso que 108 cards vazavam pra baixo e a rolagem horizontal nunca
            aparecia. */}
        {/* `relative` para as setas flutuarem sobre as bordas do trilho sem
            roubar largura dele. */}
        <div className="relative h-full min-h-0">
        <SetaDoTrilho lado="esquerda" visivel={podeEsquerda} aoClicar={() => deslizar(-1)} />
        <SetaDoTrilho lado="direita" visivel={podeDireita} aoClicar={() => deslizar(1)} />
        <div
          ref={trilho}
          className="scrollbar-slim flex h-full min-h-0 gap-4 overflow-x-auto overflow-y-hidden pb-2"
        >
          {leadingColumn}
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              title={column.title}
              color={column.color}
              count={column.leads.length}
              headerExtra={
                /* Marcar a etapa inteira é o caso real: limpar uma coluna de
                   leads frios sem clicar em trinta cards. */
                selecting && column.leads.length > 0 ? (
                  <Checkbox
                    checked={column.leads.every((l) => selectedIds.includes(l.id))}
                    onCheckedChange={(v) => toggleColumn(column, v === true)}
                    aria-label={`Selecionar os ${column.leads.length} leads da etapa ${column.title}`}
                  />
                ) : null
              }
            >
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    aria-label={`Etapa ${column.title}, ${column.leads.length} leads`}
                    className={`${boardBodyClass(snapshot.isDraggingOver)} ${
                      // Espaço pra barra flutuante não cobrir o último card:
                      // sem isso o card do pé da coluna fica atrás dela e não
                      // dá pra marcar sem rolar.
                      selecting ? 'pb-16' : ''
                    }`}
                  >
                    {column.leads.length === 0 && !snapshot.isDraggingOver && (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
                        {selecting ? 'Nenhum lead nesta etapa' : 'Arraste um lead para cá'}
                      </p>
                    )}

                    {column.leads.map((lead, index) => {
                      const name = toTitleCase(getLeadDisplayName(lead)) || getLeadDisplayName(lead);
                      const city = getLeadCity(lead);
                      const origin = getLeadOrigin(lead);
                      const wa = whatsappLink(lead.phone);
                      const parked = timeInStage(lead);
                      const checked = selectedIds.includes(lead.id);

                      return (
                        // O CARD INTEIRO arrasta, não só a alça. A alça sozinha
                        // era um alvo de 16px que ninguém achava: quem pegava o
                        // card pelo corpo — o gesto natural, e o que o
                        // GoHighLevel faz — não movia nada. A alça continua
                        // como pista visual; o foco de teclado foi pro card.
                        // No modo seleção o card não arrasta: arrastar e marcar
                        // partem do mesmo gesto (pegar o card), e deixar os
                        // dois ativos faria um cancelar o outro.
                        <Draggable
                          key={lead.id}
                          draggableId={lead.id}
                          index={index}
                          isDragDisabled={selecting}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={selecting ? () => toggleLead(lead.id) : undefined}
                              onDoubleClick={selecting ? undefined : () => setDetailLead(lead)}
                              className={`rounded-xl border bg-card p-3 transition-shadow ${
                                selecting
                                  ? `cursor-pointer ${
                                      checked
                                        ? 'border-primary/60 bg-primary/[0.04] shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
                                        : 'shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-primary/30'
                                    }`
                                  : `cursor-grab active:cursor-grabbing ${
                                      dragSnapshot.isDragging
                                        ? 'shadow-lg ring-2 ring-primary/40'
                                        : 'shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-primary/30'
                                    }`
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {/* A caixa ocupa o lugar da alça: no modo
                                    seleção o card não arrasta, então a alça
                                    estaria mentindo sobre o que ele faz. */}
                                {selecting ? (
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleLead(lead.id)}
                                    /* O clique já é tratado no card inteiro; sem
                                       parar aqui a caixa marcaria e o card
                                       desmarcaria no mesmo clique. */
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Selecionar ${name}`}
                                    className="mt-0.5"
                                  />
                                ) : (
                                  /* Só pista visual de que o card se move. O
                                     dragHandleProps agora vive no <article>: se
                                     ficasse aqui também, seriam duas alças pro
                                     mesmo item e a biblioteca acusa conflito. */
                                  <span
                                    aria-hidden="true"
                                    className="mt-0.5 text-muted-foreground/40"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                )}

                                <div className="min-w-0 flex-1">
                                  {/* Vira texto puro no modo seleção. Um botão
                                      desabilitado aqui engoliria o clique — e o
                                      nome é o maior alvo do card, justamente
                                      onde a pessoa clica pra marcar. */}
                                  {selecting ? (
                                    <p className="truncate text-sm font-semibold tracking-tight">
                                      {name}
                                    </p>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDetailLead(lead)}
                                      className="block w-full truncate text-left text-sm font-semibold tracking-tight hover:text-primary focus-visible:underline focus-visible:outline-none"
                                    >
                                      {name}
                                    </button>
                                  )}
                                  {origin && (
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`${originLabel}: ${origin}`}>
                                      {origin}
                                    </p>
                                  )}
                                </div>

                                {/* Mover sem arrastar. Fica antes do WhatsApp
                                    porque é ação sobre o funil, e some no modo
                                    seleção, onde todo clique marca o card. */}
                                {!selecting && stages.length > 1 && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                        title="Mover para outra etapa"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <CornerUpRight className="h-3.5 w-3.5" />
                                        <span className="sr-only">Mover {name} para outra etapa</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                        Mover para
                                      </DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      {stages.map((destino) => {
                                        const aqui = destino.id === column.id;
                                        return (
                                          <DropdownMenuItem
                                            key={destino.id}
                                            disabled={aqui}
                                            onClick={() => moverPeloMenu(lead, destino, column.title)}
                                            className="gap-2"
                                          >
                                            <span
                                              className="h-2 w-2 shrink-0 rounded-full"
                                              style={{ backgroundColor: destino.color }}
                                            />
                                            <span className="truncate">{destino.name}</span>
                                            {aqui && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}

                                {wa && (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="icon"
                                    // Neutro no card. O verde aparecia em quase todos os ~100 cards e
                                    // ocupava o lugar do acento do board sem dizer nada que o
                                    // ícone já não diga. Ele continua verde na ficha do lead,
                                    // onde é a ação principal e aparece uma vez.
                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
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
            </BoardColumn>
          ))}
        </div>
        </div>
      </DragDropContext>

      {/* Barra flutuante em vez de fixa no topo: só existe enquanto o modo
          está ligado, e assim não rouba altura do board — que já disputa cada
          pixel com as colunas em telas de notebook. */}
      {selecting && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 py-2 pl-5 pr-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium tabular-nums">
              {visibleSelected.length === 0
                ? 'Toque nos cards para selecionar'
                : `${visibleSelected.length} ${
                    visibleSelected.length === 1 ? 'lead selecionado' : 'leads selecionados'
                  }`}
            </span>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onExitSelection}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={visibleSelected.length === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {visibleSelected.length === 1
                ? 'Excluir 1 lead?'
                : `Excluir ${visibleSelected.length} leads?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Some junto tudo que está preso a eles: anotações, anexos, etiquetas,
              histórico e mensagens de WhatsApp. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeadDetailDialog
        lead={detailLead}
        open={detailLead !== null}
        onOpenChange={(o) => !o && setDetailLead(null)}
        originLabel={originLabel}
        onStatusChange={() => qc.invalidateQueries({ queryKey: ['leads'] })}
      />

      {perguntandoMotivo && (
        <LossReasonDialog
          companyId={companyId}
          leadName={perguntandoMotivo.leadName}
          open
          onConfirm={(motivoId, observacao) => {
            moveMutation.mutate({ ...perguntandoMotivo, lossReasonId: motivoId, lostNotes: observacao });
            setPerguntandoMotivo(null);
          }}
          onCancel={() => {
            setPerguntandoMotivo(null);
            // O card já se moveu na tela e nada foi gravado. Buscar o servidor
            // devolve ele para a coluna de origem.
            qc.invalidateQueries({ queryKey: ['leads', companyId, 'board'] });
          }}
        />
      )}
    </>
  );
}

/**
 * Seta de navegação do board.
 *
 * Fica por cima da borda do trilho, não ao lado: ocupar largura própria tiraria
 * espaço de uma tela que já não cabe sete colunas. Some quando não há para onde
 * ir — seta que não leva a lugar nenhum é ruído.
 */
function SetaDoTrilho({
  lado, visivel, aoClicar,
}: { lado: 'esquerda' | 'direita'; visivel: boolean; aoClicar: () => void }) {
  if (!visivel) return null;
  const naEsquerda = lado === 'esquerda';
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={naEsquerda ? 'Ver etapas anteriores' : 'Ver etapas seguintes'}
      className={`absolute top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 shadow-md backdrop-blur transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        naEsquerda ? 'left-1' : 'right-1'
      }`}
    >
      {naEsquerda ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}
