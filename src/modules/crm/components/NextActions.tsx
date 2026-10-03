import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, Check, Loader2, RefreshCw } from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import {
  createLeadNote, listLeadNotes, toggleNoteDone,
} from '@/modules/crm/services/leadNotesService';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function daquiA(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  // Meio da manhã: hora redonda no fim do dia vira tarefa que ninguém vê.
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * O que fazer com este lead a seguir.
 *
 * Cada botão grava uma anotação agendada — `lead_notes.scheduled_for`, que já
 * existia e já alimenta a aba de anotações com caixa de concluído. Não é uma
 * fila nova nem um sistema de tarefas paralelo: é o mesmo registro, criado em
 * um clique em vez de cinco.
 *
 * O desenho trazia um terceiro botão, "Adicionar à exclusão de remarketing".
 * Ele ficou de fora porque não existe para onde essa marcação ir: sem sincronia
 * com um público personalizado na Meta, o botão gravaria um estado que nenhum
 * anúncio lê. Controle que não responde ensina a desconfiar da tela.
 */
export function NextActions({ leadId, companyId }: { leadId: string; companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const notas = useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: () => listLeadNotes(leadId),
    enabled: Boolean(leadId),
  });

  const criar = useMutation({
    mutationFn: (v: { body: string; dias: number }) =>
      createLeadNote({
        leadId,
        companyId,
        authorId: user?.id ?? null,
        authorName: (user as { email?: string } | null)?.email ?? null,
        body: v.body,
        scheduledFor: daquiA(v.dias),
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['lead-notes', leadId] });
      toast.success('Agendado', {
        description: `Aparece nas anotações em ${DATA.format(new Date(daquiA(v.dias)))}.`,
      });
    },
    onError: (e: Error) => toast.error('Não deu para agendar', { description: e.message }),
  });

  const concluir = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleNoteDone(v.id, v.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-notes', leadId] }),
    onError: (e: Error) => toast.error('Não deu para marcar', { description: e.message }),
  });

  const pendentes = (notas.data ?? [])
    .filter((n) => n.scheduled_for && !n.done)
    .sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));

  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-3 text-sm font-semibold">Próximas ações</h3>

      {pendentes.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {pendentes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
              <button
                type="button"
                onClick={() => concluir.mutate({ id: n.id, done: true })}
                aria-label={`Marcar "${n.body}" como feito`}
                className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border bg-background hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Check className="h-3 w-3 opacity-0 transition-opacity hover:opacity-40" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="leading-snug">{n.body}</p>
                {n.scheduled_for && (
                  <p className="text-muted-foreground">{DATA.format(new Date(n.scheduled_for))}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Acao
          icone={<CalendarPlus className="h-4 w-4" />}
          titulo="Acompanhar em 3 dias"
          detalhe="Cria uma anotação agendada"
          ocupado={criar.isPending}
          aoClicar={() => criar.mutate({ body: 'Fazer contato de acompanhamento.', dias: 3 })}
        />
        <Acao
          icone={<RefreshCw className="h-4 w-4" />}
          titulo="Reengajar em 30 dias"
          detalhe="Para quem caiu por preço ou prazo"
          ocupado={criar.isPending}
          aoClicar={() => criar.mutate({ body: 'Tentar retomada com oferta diferente.', dias: 30 })}
        />
      </div>
    </section>
  );
}

function Acao({
  icone, titulo, detalhe, ocupado, aoClicar,
}: {
  icone: React.ReactNode;
  titulo: string;
  detalhe: string;
  ocupado: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={ocupado}
      className="flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{titulo}</span>
        <span className="block text-[11px] text-muted-foreground">{detalhe}</span>
      </span>
    </button>
  );
}
