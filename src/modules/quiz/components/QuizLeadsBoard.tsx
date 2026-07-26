/**
 * Kanban de leads de um quiz.
 *
 * Era uma cópia do KanbanBoard que envelheceu sozinha: gravava `stage_id`
 * direto (sem ordem, sem carimbo de etapa, sem histórico coerente), tinha a
 * alça de arrastar em `opacity-0 group-hover` — inalcançável no toque — e
 * mostrava temperatura e score, que são NULL e 0 em todos os leads. Agora usa
 * o board compartilhado, filtrado por `quizId`, e ganha de graça o modo
 * seleção, a exclusão em lote e a ficha do lead.
 *
 * O que sobrou de específico do quiz é a coluna "Visitantes": submissões que
 * ainda não viraram lead. Não pertencem a etapa nenhuma, não recebem card
 * arrastado, e por isso entram como coluna extra em vez de virar etapa.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Eye, RefreshCw } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BoardColumn, KanbanBoard, boardBodyClass } from '@/modules/crm/components/KanbanBoard';
import { relativeTime } from '@/modules/crm/lib/leadFields';

interface Props {
  quizId: string;
  companyId: string;
}

interface Visitor {
  id: string;
  status: string;
  startedAt: string;
}

async function listVisitors(quizId: string): Promise<Visitor[]> {
  const { data, error } = await supabase
    .from('quiz_submissions')
    .select('id, status, started_at')
    .eq('quiz_id', quizId)
    .is('lead_id', null)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    status: s.status as string,
    startedAt: s.started_at as string,
  }));
}

export function QuizLeadsBoard({ quizId, companyId }: Props) {
  const qc = useQueryClient();
  const [selecting, setSelecting] = useState(false);

  const visitorsQuery = useQuery({
    queryKey: ['quiz-visitors', quizId],
    queryFn: () => listVisitors(quizId),
    enabled: Boolean(quizId),
  });

  const visitors = visitorsQuery.data ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['stages', companyId] });
    void qc.invalidateQueries({ queryKey: ['quiz-visitors', quizId] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex justify-end gap-2">
        <Button
          variant={selecting ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={selecting}
          onClick={() => setSelecting((v) => !v)}
        >
          <CheckSquare className="mr-2 h-4 w-4" />
          {selecting ? 'Sair da seleção' : 'Selecionar'}
        </Button>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <KanbanBoard
          quizId={quizId}
          selecting={selecting}
          onExitSelection={() => setSelecting(false)}
          leadingColumn={
            <BoardColumn title="Visitantes" color="#94a3b8" count={visitors.length}>
              <div className={boardBodyClass()} aria-label={`Visitantes, ${visitors.length}`}>
                {visitorsQuery.isLoading && (
                  <>
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                  </>
                )}

                {!visitorsQuery.isLoading && visitors.length === 0 && (
                  <p className="flex flex-col items-center gap-1.5 px-2 py-6 text-center text-xs text-muted-foreground/70">
                    <Eye className="h-4 w-4 opacity-50" />
                    Ninguém respondeu sem deixar contato
                  </p>
                )}

                {visitors.map((v) => (
                  /* Card sem alça e sem clique: um visitante não tem ficha pra
                     abrir nem etapa pra onde ir. É informação, não ação. */
                  <article
                    key={v.id}
                    className="rounded-xl border border-dashed bg-card/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Visitante
                      </span>
                      <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[11px]">
                        {v.status === 'completed' ? 'Completou' : 'Em andamento'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {relativeTime(v.startedAt)}
                    </p>
                  </article>
                ))}
              </div>
            </BoardColumn>
          }
        />
      </div>
    </div>
  );
}
