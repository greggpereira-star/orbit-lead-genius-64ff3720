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

  /* `text-xs` e `px-3` em vez do tamanho padrão, e o rótulo podendo encolher.
     A conta: o cartão tem 400px, cada botão fica com 180px, e "Chamar no
     WhatsApp" a 14px pede 182. Como o botão base é `whitespace-nowrap`, não
     havia quebra possível — o texto simplesmente saía pela borda. A 12px sobra
     folga, e o `truncate` garante que qualquer rótulo futuro encurte em vez de
     escapar. São ações secundárias: tamanho menor é adequado, não concessão. */
  const estilo = 'h-9 min-w-0 justify-start px-3 text-xs';

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {/* `disabled` não existe em <a>: a versão anterior marcava o botão como
          desabilitado e o link seguia clicável, navegando para `undefined` —
          ou seja, recarregando a própria página. Sem destino, vira um botão
          de verdade desabilitado. */}
      {email ? (
        <Button asChild variant="outline" className={estilo}>
          <a href={`mailto:${email}`}>
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="ml-1.5 truncate">Enviar e-mail</span>
          </a>
        </Button>
      ) : (
        <Button variant="outline" className={estilo} disabled title="Este lead não tem e-mail">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="ml-1.5 truncate">Enviar e-mail</span>
        </Button>
      )}

      {whatsapp ? (
        <Button
          asChild
          variant="outline"
          className={`${estilo} border-emerald-600/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400`}
        >
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="ml-1.5 truncate">Chamar no WhatsApp</span>
          </a>
        </Button>
      ) : (
        <Button variant="outline" className={estilo} disabled title="Este lead não tem telefone">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="ml-1.5 truncate">Chamar no WhatsApp</span>
        </Button>
      )}

      <Button
        variant="outline"
        className={estilo}
        disabled={agendar.isPending}
        onClick={() => agendar.mutate({ body: 'Reunião a combinar com o lead.', dias: 2 })}
      >
        <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
        <span className="ml-1.5 truncate">Agendar reunião</span>
      </Button>

      <Button
        variant="outline"
        className={estilo}
        disabled={agendar.isPending}
        onClick={() => agendar.mutate({ body: 'Tarefa de acompanhamento.', dias: 1 })}
      >
        <CheckSquare className="h-3.5 w-3.5 shrink-0" />
        <span className="ml-1.5 truncate">Criar tarefa</span>
      </Button>
    </div>
  );
}
