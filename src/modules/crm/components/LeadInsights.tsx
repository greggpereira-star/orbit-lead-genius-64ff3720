import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Lightbulb } from 'lucide-react';

import { listarCaminhoDoLead, type LeadRow } from '@/modules/crm/services/leadService';

interface Leitura {
  /** A frase. Sempre afirma algo que foi lido, nunca algo estimado. */
  texto: string;
  /** De onde saiu. Aparece na tela: leitura sem origem não se confere. */
  fonte: string;
}

/**
 * O que os dados deste lead dizem.
 *
 * O desenho pedia "Insights inteligentes" com frases como "alta chance de
 * reengajamento". Não existe modelo nenhum por trás disso aqui — nem base
 * histórica de reengajamento para calcular chance — e um número inventado numa
 * tela de CRM é pior que nenhum: ele parece medido e vira decisão de verdade.
 *
 * Então cada linha abaixo é uma LEITURA, com a origem nomeada ao lado. O que é
 * conclusão sai rotulado como sugestão, no fim, separado dos fatos.
 */
export function LeadInsights({ lead }: { lead: LeadRow }) {
  const caminho = useQuery({
    queryKey: ['caminho-do-lead', lead.id],
    queryFn: () => listarCaminhoDoLead(lead.id),
    enabled: Boolean(lead.id),
  });

  const passos = caminho.data ?? [];
  const leituras: Leitura[] = [];

  const maisFundo = passos
    .filter((p) => p.to_order_index != null)
    .reduce<typeof passos[number] | null>(
      (a, p) => (!a || (p.to_order_index ?? -1) > (a.to_order_index ?? -1) ? p : a), null);

  if (maisFundo?.to_stage_name) {
    leituras.push({
      texto: `Chegou até "${maisFundo.to_stage_name}" antes de sair do funil.`,
      fonte: 'histórico de etapas',
    });
  }

  const comMotivo = passos.find((p) => p.loss_reason_name);
  if (comMotivo?.loss_reason_name) {
    leituras.push({ texto: `Motivo registrado: ${comMotivo.loss_reason_name}.`, fonte: 'motivo da perda' });
  }

  if (passos.length >= 2) {
    const primeiro = passos[0];
    const ultimo = passos[passos.length - 1];
    const dias = Math.round(
      (new Date(ultimo.moved_at).getTime() - new Date(primeiro.moved_at).getTime()) / 86400000);
    leituras.push({
      texto: dias >= 1
        ? `Percorreu ${passos.length} mudanças de etapa em ${dias} ${dias === 1 ? 'dia' : 'dias'}.`
        : `Percorreu ${passos.length} mudanças de etapa no mesmo dia.`,
      fonte: 'histórico de etapas',
    });
  }

  // Os tipos gerados do Supabase estão atrás do schema nestes dois campos; o
  // banco tem as colunas, conferido em 03/10/2026.
  const negocio = lead as unknown as { deal_value?: number | null; deal_currency?: string | null };
  if (negocio.deal_value) {
    leituras.push({
      texto: `Valor de negócio informado: ${Number(negocio.deal_value).toLocaleString('pt-BR', {
        style: 'currency', currency: negocio.deal_currency || 'BRL',
      })}.`,
      fonte: 'campo Negócio',
    });
  }

  if (!lead.assigned_to) {
    leituras.push({ texto: 'Nenhuma pessoa responsável atribuída.', fonte: 'campo Responsável' });
  }

  // Sugestão só quando há base para ela: lead que caiu fundo é diferente de
  // lead que nunca engajou, e é a única distinção que o dado sustenta.
  const sugestao =
    maisFundo && (maisFundo.to_order_index ?? 0) >= 2
      ? 'Chegou longe no funil antes de cair. Vale uma tentativa de retomada com uma oferta diferente — é o grupo mais próximo de comprar entre os perdidos.'
      : null;

  if (caminho.isLoading || leituras.length === 0) return null;

  return (
    <section className="rounded-xl border bg-primary/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">O que os dados dizem</h3>
        </div>
        {/* O rótulo é literal de propósito. "Análise baseada em padrões"
            prometeria um modelo que não existe. */}
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          lido do cadastro, sem estimativa
        </span>
      </div>

      <ul className="space-y-2">
        {leituras.map((l) => (
          <li key={l.texto} className="flex items-start gap-2 text-xs leading-snug">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>
              {l.texto}{' '}
              <span className="text-muted-foreground">({l.fonte})</span>
            </span>
          </li>
        ))}
      </ul>

      {sugestao && (
        <p className="mt-3 border-t pt-3 text-xs leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Sugestão: </span>
          {sugestao}
        </p>
      )}
    </section>
  );
}
