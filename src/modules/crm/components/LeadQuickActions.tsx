import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, CheckSquare, ChevronDown, Mail, MessageCircle, PhoneCall } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useSomenteLeitura } from '@/modules/permissoes/usePermissoes';
import { createLeadNote } from '@/modules/crm/services/leadNotesService';
import { registrarContato, ultimoContato } from '@/modules/crm/services/contatoService';
import {
  CANAIS_DE_CONTATO,
  descreverUltimoContato,
  rotuloDoCanal,
  type CanalDeContato,
} from '@/modules/crm/lib/contatos';

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
  const leitura = useSomenteLeitura();

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

  const ultimo = useQuery({
    queryKey: ['lead-contacts', leadId],
    queryFn: () => ultimoContato(leadId),
    staleTime: 30_000,
  });

  const contatei = useMutation({
    mutationFn: (canal: CanalDeContato) => registrarContato(leadId, canal),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['lead-contacts', leadId] });
      qc.invalidateQueries({ queryKey: ['tempo-de-resposta'] });
      toast.success(
        r.repetido
          ? 'Esse contato já estava registrado'
          : `Contato registrado (${rotuloDoCanal(r.canal)})`,
      );
    },
    onError: (e: Error) => toast.error('Não deu para registrar o contato', { description: e.message }),
  });

  /* Empilhados, não lado a lado. Na coluna de propriedades de 336px dois
     botões por linha dão 146px cada, e "Chamar no WhatsApp" pede 182 — foi o
     que truncou. Encolher a fonte foi o remendo da vez passada; a resposta
     certa numa coluna estreita é uma ação por linha. `min-w-0` e `truncate`
     ficam como rede para rótulos futuros. */
  const estilo = 'h-10 w-full min-w-0 justify-start px-3.5';

  return (
    <div className="grid gap-2">
      {/* `disabled` não existe em <a>: a versão anterior marcava o botão como
          desabilitado e o link seguia clicável, navegando para `undefined` —
          ou seja, recarregando a própria página. Sem destino, vira um botão
          de verdade desabilitado. */}
      {email ? (
        <Button asChild variant="outline" className={estilo}>
          <a href={`mailto:${email}`}>
            <Mail className="h-4 w-4 shrink-0" />
            <span className="ml-2 truncate">Enviar e-mail</span>
          </a>
        </Button>
      ) : (
        <Button variant="outline" className={estilo} disabled title="Este lead não tem e-mail">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="ml-2 truncate">Enviar e-mail</span>
        </Button>
      )}

      {whatsapp ? (
        <Button
          asChild
          variant="outline"
          className={`${estilo} border-[var(--sucesso-borda)] text-[var(--sucesso)] hover:bg-[var(--sucesso-suave)]`}
        >
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="ml-2 truncate">Chamar no WhatsApp</span>
          </a>
        </Button>
      ) : (
        <Button variant="outline" className={estilo} disabled title="Este lead não tem telefone">
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="ml-2 truncate">Chamar no WhatsApp</span>
        </Button>
      )}

      {!leitura && (
        <div className="grid gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={estilo} disabled={contatei.isPending}>
                <PhoneCall className="h-4 w-4 shrink-0" />
                <span className="ml-2 truncate">Registrar contato</span>
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Falei com este lead por…
              </DropdownMenuLabel>
              {CANAIS_DE_CONTATO.map((c) => (
                <DropdownMenuItem
                  key={c.valor}
                  className="min-h-11 md:min-h-0"
                  onSelect={() => contatei.mutate(c.valor)}
                >
                  {c.rotulo}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* O horário gravado é o do clique, não o do contato: registrar tarde aparece tarde. */}
          <p className="px-0.5 text-xs text-muted-foreground">
            {ultimo.isError
              ? 'Não foi possível ler o último contato registrado.'
              : ultimo.data
                ? `Último registro: ${descreverUltimoContato(ultimo.data)}`
                : ultimo.isLoading
                  ? ''
                  : 'Nenhum contato registrado. Vale o horário do clique.'}
          </p>
        </div>
      )}

      {!leitura && (
        <Button
          variant="outline"
          className={estilo}
          disabled={agendar.isPending}
          onClick={() => agendar.mutate({ body: 'Reunião a combinar com o lead.', dias: 2 })}
        >
          <CalendarPlus className="h-4 w-4 shrink-0" />
          <span className="ml-2 truncate">Agendar reunião</span>
        </Button>
      )}

      {!leitura && (
        <Button
          variant="outline"
          className={estilo}
          disabled={agendar.isPending}
          onClick={() => agendar.mutate({ body: 'Tarefa de acompanhamento.', dias: 1 })}
        >
          <CheckSquare className="h-4 w-4 shrink-0" />
          <span className="ml-2 truncate">Criar tarefa</span>
        </Button>
      )}
    </div>
  );
}
