import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, UserPlus, UserRound, X } from 'lucide-react';

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { listarMembrosDaEquipe } from '@/modules/crm/services/teamService';
import { atribuirResponsavel } from '@/modules/crm/services/leadService';

/** Iniciais para o disco, do mesmo jeito que o card do board faz. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/**
 * Quem é dono deste lead.
 *
 * `leads.assigned_to` existia no banco desde sempre e só o mapeamento de
 * formulário da Meta escrevia nele — 0 dos 489 leads tinham responsável. Sem
 * campo na tela, ninguém atribuía; sem atribuição, não há como cobrar
 * follow-up nem saber quem está segurando quantos leads.
 *
 * Vazio não fica mudo: o estado sem dono é o mais comum hoje e é justamente o
 * que precisa convidar à ação.
 */
export function OwnerPicker({
  leadId, companyId, responsavelAtual,
}: {
  leadId: string;
  companyId: string;
  responsavelAtual: string | null;
}) {
  const qc = useQueryClient();

  const equipe = useQuery({
    queryKey: ['equipe', companyId],
    queryFn: () => listarMembrosDaEquipe(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
  });

  const atribuir = useMutation({
    mutationFn: (userId: string | null) => atribuirResponsavel(leadId, userId),
    onSuccess: (_, userId) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      const nome = equipe.data?.find((m) => m.userId === userId)?.nome;
      toast.success(userId ? `Responsável: ${nome}` : 'Lead sem responsável');
    },
    onError: (e: Error) => toast.error('Não deu para atribuir', { description: e.message }),
  });

  const lista = equipe.data ?? [];
  const atual = lista.find((m) => m.userId === responsavelAtual) ?? null;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70"><UserRound className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          Responsável
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={atribuir.isPending}
              className="-mx-1 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {atribuir.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : atual ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {iniciais(atual.nome)}
                </span>
              ) : (
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={`truncate text-sm font-medium ${atual ? '' : 'text-muted-foreground'}`}>
                {atual ? atual.nome : 'Atribuir responsável'}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Quem cuida deste lead
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {equipe.isLoading && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!equipe.isLoading && lista.length === 0 && (
              // Empresa de uma pessoa só é o caso comum no começo. Dizer o que
              // fazer vale mais que uma lista vazia.
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Só existe você nesta empresa. Convide o time em Configurações para poder
                dividir os leads.
              </p>
            )}

            {lista.map((m) => (
              <DropdownMenuItem key={m.userId} onClick={() => atribuir.mutate(m.userId)} className="gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {iniciais(m.nome)}
                </span>
                <span className="min-w-0 truncate">{m.nome}</span>
                {m.userId === responsavelAtual && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
              </DropdownMenuItem>
            ))}

            {atual && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => atribuir.mutate(null)} className="gap-2 text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                  Deixar sem responsável
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
