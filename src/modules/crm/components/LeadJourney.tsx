import { useQuery } from '@tanstack/react-query';
import { Loader2, Route } from 'lucide-react';

import { listarCaminhoDoLead } from '@/modules/crm/services/leadService';

/** "3 dias", "4 h", "12 min" — a unidade que faz a diferença caber na frase. */
function duracao(de: string, ate: string): string {
  const ms = new Date(ate).getTime() - new Date(de).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

/**
 * Por onde o lead passou.
 *
 * O histórico é gravado por gatilho desde 03/10/2026 e não aparecia em lugar
 * nenhum da interface. É o dado que responde as perguntas que a ficha não
 * respondia: até onde ele chegou antes de cair, quanto tempo ficou parado em
 * cada degrau, e se quem mexeu foi uma pessoa ou uma automação.
 *
 * O histórico começa na data em que o gatilho entrou. Lead parado desde julho
 * não tem linha nenhuma — e a tela diz isso, em vez de desenhar um caminho
 * que ninguém mediu.
 */
export function LeadJourney({ leadId, criadoEm }: { leadId: string; criadoEm: string | null }) {
  const caminho = useQuery({
    queryKey: ['caminho-do-lead', leadId],
    queryFn: () => listarCaminhoDoLead(leadId),
    enabled: Boolean(leadId),
  });

  if (caminho.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const passos = caminho.data ?? [];

  return (
    <section className="rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Caminho no funil</h3>
      </div>

      {passos.length === 0 ? (
        <p className="text-xs leading-snug text-muted-foreground">
          Nenhuma mudança de etapa registrada. O histórico passou a ser gravado em 3 de
          outubro de 2026 — movimentos anteriores a isso não existem como dado.
        </p>
      ) : (
        <ol className="relative space-y-3">
          <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
          {passos.map((p, i) => {
            const anterior = i === 0 ? criadoEm : passos[i - 1].moved_at;
            return (
              <li key={`${p.moved_at}-${i}`} className="relative flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-background" />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium">
                    {p.from_stage_name ? `${p.from_stage_name} → ` : 'Entrou em '}
                    {p.to_stage_name ?? '—'}
                  </p>
                  <p className="text-muted-foreground">
                    {DATA.format(new Date(p.moved_at))}
                    {anterior && <> · ficou {duracao(anterior, p.moved_at)} na etapa anterior</>}
                    {/* Quem mexeu é informação, não detalhe técnico: lead movido
                        por automação e lead movido por pessoa significam coisas
                        diferentes na hora de cobrar follow-up. */}
                    {' · '}{p.moved_by ? 'por uma pessoa' : 'automático'}
                  </p>
                  {p.loss_reason_name && (
                    <p className="mt-0.5 text-muted-foreground">
                      Motivo registrado: <span className="font-medium text-foreground">{p.loss_reason_name}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
