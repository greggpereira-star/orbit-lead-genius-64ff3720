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
 * Conversão de VENDA, disparada quando o lead entra numa etapa de ganho.
 *
 * Diferente da conversão de lead, esta acontece dias ou semanas depois do
 * clique — é exatamente para isso que existe importação offline. O `gclid`
 * guardado no lead é o que amarra a venda de volta ao anúncio que a originou.
 */
export const enviarConversaoVenda = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ leadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: lead } = await supabaseAdmin
      .from('leads')
      // `deal_value` e `deal_currency` são novas e ainda não estão no
      // `types.ts` gerado — daí o `as any` na seleção. Regerar os tipos exige
      // rodar o CLI do Supabase contra o banco, o que não cabe neste caminho.
      .select('id, company_id, gclid, email, phone, deal_value, deal_currency' as any)
      .eq('id', data.leadId)
      .maybeSingle();

    if (!lead) return { status: 'sem_lead' as const };

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
      leadId: data.leadId,
      gclid: l.gclid,
      email: l.email,
      phone: l.phone,
      // `numeric` volta como string do PostgREST — mandar assim faria o Google
      // recusar o valor sem dizer o motivo.
      valor: l.deal_value == null ? null : Number(l.deal_value),
      moeda: l.deal_currency,
    });

    // Registrado na ficha do lead: é o histórico que responde "essa venda foi
    // para o Google?" sem precisar abrir log de servidor.
    await supabaseAdmin.from('lead_events').insert({
      lead_id: data.leadId,
      event_type: 'google_conversion',
      description:
        r.status === 'enviada'
          ? 'Conversão de venda enviada ao Google Ads'
          : `Conversão de venda não enviada: ${r.detalhe ?? r.status}`,
      metadata: { status: r.status, detalhe: r.detalhe ?? null },
    } as never);

    return { status: r.status, detalhe: r.detalhe ?? null };
  });
