import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, CheckSquare, Mail, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { createLeadNote } from '@/modules/crm/services/leadNotesService';

/**
 * O que dá para fazer agora com este lead.
 *
 * As quatro ações existem de verdade: duas abrem o canal (mailto, wa.me) e
 * duas gravam anotação agendada em `lead_notes.scheduled_for`. "Mover para
 * outra etapa" não entra aqui porque já existe no seletor do cabeçalho — um
 * segundo caminho para a mesma escrita acabaria divergindo do primeiro, e a
 * regra de etapa de perda vive lá.
 */
export function LeadQuickActions({
  leadId, companyId, email, whatsapp,
}: {
  leadId: string;
  companyId: string;
  email: string | null;
  whatsapp: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const agendar = useMutation({
    mutationFn: (v: { body: string; dias: number }) => {
      const d = new Date();
      d.setDate(d.getDate() + v.dias);
      d.setHours(9, 0, 0, 0);
      return createLeadNote({
        leadId, companyId,
        authorId: user?.id ?? null,
        authorName: (user as { email?: string } | null)?.email ?? null,
        body: v.body,
        scheduledFor: d.toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-notes', leadId] });
      toast.success('Agendado nas anotações');
    },
    onError: (e: Error) => toast.error('Não deu para agendar', { description: e.message }),
  });

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button asChild variant="outline" className="justify-start" disabled={!email}>
        <a href={email ? `mailto:${email}` : undefined} aria-disabled={!email}>
          <Mail className="h-4 w-4" />
          <span className="ml-2">Enviar e-mail</span>
        </a>
      </Button>

      <Button
        asChild
        variant="outline"
        className="justify-start border-emerald-600/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
      >
        <a href={whatsapp ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsapp}>
          <MessageCircle className="h-4 w-4" />
          <span className="ml-2">Chamar no WhatsApp</span>
        </a>
      </Button>

      <Button
        variant="outline"
        className="justify-start"
        disabled={agendar.isPending}
        onClick={() => agendar.mutate({ body: 'Reunião a combinar com o lead.', dias: 2 })}
      >
        <CalendarPlus className="h-4 w-4" />
        <span className="ml-2">Agendar reunião</span>
      </Button>

      <Button
        variant="outline"
        className="justify-start"
        disabled={agendar.isPending}
        onClick={() => agendar.mutate({ body: 'Tarefa de acompanhamento.', dias: 1 })}
      >
        <CheckSquare className="h-4 w-4" />
        <span className="ml-2">Criar tarefa</span>
      </Button>
    </div>
  );
}
