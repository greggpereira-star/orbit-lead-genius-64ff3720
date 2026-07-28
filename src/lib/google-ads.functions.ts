/**
 * Ações do Google Ads chamadas pela tela: escolher qual conversão representa
 * o lead e qual representa a venda, e disparar a conversão de venda quando o
 * lead é ganho.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Guarda a escolha de conversão feita no wizard. */
export const salvarConversaoGoogle = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        customerId: z.string().min(1),
        conversionActionId: z.string().min(1),
        tipo: z.enum(['lead', 'sale']),
        /** Só para a tela de pixel: `AW-123/rótulo`, usado pelo gtag. */
        conversionId: z.string().nullable().optional(),
        rotulo: z.string().nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: atual } = await supabaseAdmin
      .from('integrations')
      .select('config')
      .eq('company_id', data.companyId)
      .eq('provider', 'google_ads')
      .maybeSingle();

    const config = { ...(((atual?.config as Record<string, unknown>) ?? {}) as Record<string, unknown>) };
    config.customer_id = data.customerId;
    config[data.tipo === 'lead' ? 'lead_conversion_action' : 'sale_conversion_action'] =
      `customers/${data.customerId}/conversionActions/${data.conversionActionId}`;

    // O gtag do navegador usa `AW-123/rótulo`; a API usa o nome do recurso.
    // São identificadores diferentes da MESMA conversão, e guardar os dois
    // aqui é o que permite o disparo no navegador e o envio pelo servidor
    // caírem na mesma linha do Google Ads em vez de contarem duas vezes.
    if (data.tipo === 'lead' && data.conversionId && data.rotulo) {
      config.conversion_id = data.conversionId;
      config.lead_label = data.rotulo;
    }
    if (data.tipo === 'sale' && data.conversionId && data.rotulo) {
      config.conversion_id = data.conversionId;
      config.complete_label = data.rotulo;
    }

    const { error } = await supabaseAdmin
      .from('integrations')
      .upsert(
        { company_id: data.companyId, provider: 'google_ads', config, status: 'connected' } as never,
        { onConflict: 'company_id,provider' },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Grava o valor da venda e, se o lead já está ganho, manda a conversão.
 *
 * A ordem em que as duas coisas acontecem no mundo real é imprevisível: às
 * vezes o valor é preenchido antes de fechar, às vezes depois. Se fosse só um
 * update, quem move para "Venda fechada" e só então digita o valor teria a
 * conversão enviada sem valor — e nada avisaria. Aqui o disparo acompanha a
 * gravação, e o `orderId` no envio impede que uma segunda passagem vire uma
 * segunda conversão.
 */
export const salvarValorDaVenda = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        valor: z.number().nonnegative().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ deal_value: data.valor } as never)
      .eq('id', data.leadId);
    if (error) throw new Error(error.message);

    // Só interessa quem já está em etapa de ganho.
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('stage_id, stages!inner(kind)' as never)
      .eq('id', data.leadId)
      .maybeSingle();

    const kind = (lead as { stages?: { kind?: string } } | null)?.stages?.kind;
    if (kind !== 'won') return { salvo: true as const, conversao: null };

    const r = await despacharConversaoVenda(data.leadId);
    return { salvo: true as const, conversao: r.status };
  });

/**
 * Monta e envia a conversão de venda de um lead.
 *
 * Fora das server functions porque as duas precisam dela — a que dispara na
 * mudança de etapa e a que dispara ao gravar o valor depois do fechamento.
 */
async function despacharConversaoVenda(
  leadId: string,
): Promise<{ status: string; detalhe: string | null }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: lead } = await supabaseAdmin
    .from('leads')
    // `deal_value`/`deal_currency` são novas e ainda não estão no `types.ts`
    // gerado; regerar exige rodar o CLI do Supabase contra o banco.
    .select('id, company_id, gclid, email, phone, deal_value, deal_currency' as never)
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return { status: 'sem_lead', detalhe: null };

  const l = lead as unknown as {
    company_id: string;
    gclid: string | null;
    email: string | null;
    phone: string | null;
    deal_value: number | string | null;
    deal_currency: string | null;
  };

  const { enviarConversaoGoogle } = await import('./google-ads.server');
  const r = await enviarConversaoGoogle({
    companyId: l.company_id,
    tipo: 'sale',
    leadId,
    gclid: l.gclid,
    email: l.email,
    phone: l.phone,
    // `numeric` volta como string do PostgREST — mandar assim faria o Google
    // recusar o valor sem dizer o motivo.
    valor: l.deal_value == null ? null : Number(l.deal_value),
    moeda: l.deal_currency,
  });

  // Registrado na ficha: é o histórico que responde "essa venda foi para o
  // Google?" sem precisar abrir log de servidor.
  await supabaseAdmin.from('lead_events').insert({
    lead_id: leadId,
    event_type: 'google_conversion',
    description:
      r.status === 'enviada'
        ? 'Conversão de venda enviada ao Google Ads'
        : `Conversão de venda não enviada: ${r.detalhe ?? r.status}`,
    metadata: { status: r.status, detalhe: r.detalhe ?? null },
  } as never);

  return { status: r.status, detalhe: r.detalhe ?? null };
}

/**
 * Conversão de VENDA, disparada quando o lead entra numa etapa de ganho.
 *
 * Diferente da conversão de lead, esta acontece dias ou semanas depois do
 * clique — é exatamente para isso que existe importação offline. O `gclid`
 * guardado no lead é o que amarra a venda de volta ao anúncio que a originou.
 */
export const enviarConversaoVenda = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ leadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => despacharConversaoVenda(data.leadId));
