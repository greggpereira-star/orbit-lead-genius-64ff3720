/**
 * Pipeline de vendas.
 *
 * A página anterior estava em inglês ("Sales Pipeline", "New Deal") e tinha
 * dois controles sem função: o botão "New Deal" não fazia nada e as abas
 * Kanban/List não trocavam de visão. Foram removidos em vez de mantidos
 * inertes — um controle que não responde ensina o usuário a desconfiar da tela.
 */
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import { KanbanBoard } from '@/modules/crm/components/KanbanBoard';
import { StageManagerDialog } from '@/modules/crm/components/StageManagerDialog';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listLeads } from '@/modules/crm/services/leadService';

export const Route = createFileRoute('/_app/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  const { company } = useAuth();
  const companyId = company?.id ?? '';
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState(false);

  // Mesma chave do board: o React Query serve as duas do mesmo cache, então o
  // contador não custa uma requisição a mais.
  const leadsQuery = useQuery({
    queryKey: ['leads', companyId, 'board'],
    queryFn: () => listLeads(companyId),
    enabled: Boolean(companyId),
  });
  const total = leadsQuery.data?.length ?? 0;

  return (
    /* Altura presa ao viewport, e não `h-full`.
       O <main> do shell tem min-height:auto e cresce com o conteúdo, então
       `h-full` aqui resolvia contra um pai que já havia esticado — as colunas
       viravam uma lista de 11.000px e a rolagem horizontal ficava fora da
       tela. Descontar só o padding do <main> (p-4 / md:p-6) deixa o cabeçalho
       da página variar de altura sem quebrar nada, porque quem absorve é o
       `flex-1 min-h-0` abaixo. */
    <div className="flex h-[calc(100dvh-2rem)] flex-col gap-5 overflow-hidden md:h-[calc(100dvh-3rem)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} ${total === 1 ? 'lead' : 'leads'} no funil. Arraste para mudar de etapa.`
              : 'Arraste os leads entre as etapas do seu funil.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no funil…"
              aria-label="Buscar lead no funil"
              className="h-9 w-56 pl-9"
            />
          </div>
          <Button variant="outline" className="h-9" onClick={() => setManaging(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Gerenciar etapas
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ErrorBoundary name="KanbanBoard">
          <KanbanBoard search={search} />
        </ErrorBoundary>
      </div>

      <StageManagerDialog companyId={companyId} open={managing} onOpenChange={setManaging} />
    </div>
  );
}
