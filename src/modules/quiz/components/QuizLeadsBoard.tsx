import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Eye, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  quizId: string;
  companyId: string;
}

interface LeadCard {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  temperature: string;
  score: number;
}

interface VisitorCard {
  id: string;
  status: string;
  startedAt: string;
  score: number | null;
  temperature: string | null;
}

interface Stage {
  id: string;
  name: string;
  color: string | null;
}

interface Column {
  id: string;
  title: string;
  color?: string | null;
  draggable: boolean;
  leads: LeadCard[];
  visitors: VisitorCard[];
}

const VISITORS_COLUMN = 'visitantes';
const NO_STAGE_COLUMN = 'sem-etapa';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export function QuizLeadsBoard({ quizId, companyId }: Props) {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stagesRes, leadsRes, submissionsRes] = await Promise.all([
        supabase.from('stages').select('id, name, color').eq('company_id', companyId).order('order_index'),
        supabase
          .from('leads')
          .select('id, name, email, phone, temperature, score, stage_id, quiz_id')
          .eq('company_id', companyId)
          .eq('quiz_id' as never, quizId),
        supabase
          .from('quiz_submissions')
          .select('id, status, started_at, score, temperature, lead_id')
          .eq('quiz_id', quizId)
          .is('lead_id', null)
          .order('started_at', { ascending: false })
          .limit(100),
      ]);
      if (stagesRes.error) throw stagesRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (submissionsRes.error) throw submissionsRes.error;

      const stages = (stagesRes.data ?? []) as unknown as Stage[];
      const leads = (leadsRes.data ?? []) as unknown as (LeadCard & { stage_id: string | null })[];
      const visitors: VisitorCard[] = ((submissionsRes.data ?? []) as unknown as {
        id: string; status: string; started_at: string; score: number | null; temperature: string | null;
      }[]).map((s) => ({ id: s.id, status: s.status, startedAt: s.started_at, score: s.score, temperature: s.temperature }));

      const noStageLeads = leads.filter((l) => !l.stage_id || !stages.some((s) => s.id === l.stage_id));

      const next: Column[] = [
        { id: VISITORS_COLUMN, title: 'Visitantes', draggable: false, leads: [], visitors },
        { id: NO_STAGE_COLUMN, title: 'Sem etapa', draggable: true, leads: noStageLeads, visitors: [] },
        ...stages.map((s) => ({
          id: s.id,
          title: s.name,
          color: s.color,
          draggable: true,
          leads: leads.filter((l) => l.stage_id === s.id),
          visitors: [],
        })),
      ];
      setColumns(next);
    } catch (e: unknown) {
      toast.error('Erro ao carregar leads do quiz: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [quizId, companyId]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (destination.droppableId === VISITORS_COLUMN) return;

    const sourceCol = columns.find((c) => c.id === source.droppableId);
    const destCol = columns.find((c) => c.id === destination.droppableId);
    if (!sourceCol || !destCol) return;

    const movedLead = sourceCol.leads.find((l) => l.id === draggableId);
    if (!movedLead) return;

    const next = columns.map((c) => {
      if (c.id === sourceCol.id) return { ...c, leads: c.leads.filter((l) => l.id !== draggableId) };
      if (c.id === destCol.id) return { ...c, leads: [...c.leads, movedLead] };
      return c;
    });
    setColumns(next);

    const newStageId = destCol.id === NO_STAGE_COLUMN ? null : destCol.id;
    const { error } = await supabase.from('leads').update({ stage_id: newStageId } as never).eq('id', draggableId);
    if (error) {
      toast.error('Falha ao mover lead');
      void fetchData();
    } else {
      await supabase.from('lead_events').insert({
        lead_id: draggableId,
        event_type: 'stage_change',
        description: `Movido de ${sourceCol.title} para ${destCol.title}`,
      } as never);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void fetchData()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column.id} className="flex flex-col w-72 shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                {column.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />}
                <h3 className="font-semibold text-sm">{column.title}</h3>
                <Badge variant="secondary" className="text-[10px]">
                  {column.id === VISITORS_COLUMN ? column.visitors.length : column.leads.length}
                </Badge>
              </div>

              <Droppable droppableId={column.id} isDropDisabled={!column.draggable}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 min-h-[120px] rounded-lg p-2 space-y-2 border border-dashed border-border/40 ${
                      snapshot.isDraggingOver ? 'bg-primary/5 border-primary/30' : 'bg-muted/20'
                    }`}
                  >
                    {column.id === VISITORS_COLUMN
                      ? column.visitors.map((v) => (
                          <Card key={v.id} className="p-2.5 bg-card/60 border-dashed">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-muted-foreground">Visitante</span>
                              <Badge variant="outline" className="text-[9px] h-4">
                                {v.status === 'completed' ? 'Completou' : 'Em andamento'}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{timeAgo(v.startedAt)}</p>
                          </Card>
                        ))
                      : column.leads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index} isDragDisabled={!column.draggable}>
                            {(dragProvided, dragSnapshot) => (
                              <Card
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={`p-2.5 group cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all ${
                                  dragSnapshot.isDragging ? 'shadow-xl ring-2 ring-primary bg-card' : 'bg-card'
                                }`}
                                onClick={() => navigate({ to: '/leads/$id', params: { id: lead.id } })}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <div {...dragProvided.dragHandleProps} className="opacity-0 group-hover:opacity-100 shrink-0">
                                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                      <span className="text-xs font-semibold truncate">{lead.name || 'Sem nome'}</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate ml-4">{lead.email || lead.phone || '—'}</p>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] h-4 shrink-0 ${
                                      lead.temperature === 'hot' ? 'text-rose-600 bg-rose-50 border-rose-100' :
                                      lead.temperature === 'warm' ? 'text-amber-600 bg-amber-50 border-amber-100' :
                                      'text-blue-600 bg-blue-50 border-blue-100'
                                    }`}
                                  >
                                    {lead.temperature}
                                  </Badge>
                                </div>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                    {provided.placeholder}
                    {column.id !== VISITORS_COLUMN && column.leads.length === 0 && (
                      <div className="text-center py-6 text-[10px] text-muted-foreground">Nenhum lead aqui</div>
                    )}
                    {column.id === VISITORS_COLUMN && column.visitors.length === 0 && (
                      <div className="text-center py-6 text-[10px] text-muted-foreground flex flex-col items-center gap-1">
                        <Eye className="h-3.5 w-3.5 opacity-50" /> Sem visitantes recentes
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
