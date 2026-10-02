import { createFileRoute } from '@tanstack/react-router';

/**
 * Despacha as conversões que o gatilho de etapa enfileirou.
 *
 * Roda separado do gatilho de propósito. A transição de etapa acontece numa
 * transação do banco, e chamar a Meta de dentro dela prenderia a transação na
 * latência de uma API externa — o usuário veria o card travar ao arrastar, e um
 * timeout da Meta derrubaria a própria mudança de etapa. A fila desacopla: mover
 * o lead é instantâneo e nunca falha por causa de rede.
 */

const LOTE = 25;

export const Route = createFileRoute('/api/public/cron/conversion-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env.CRON_SECRET || 'altflow_retry_sync_secret';
        if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const admin = supabaseAdmin as any;

        const { data: pendentes, error } = await admin
          .from('conversion_dispatches')
          .select('id, company_id, lead_id, stage_id, event_id, occurred_at, attempts')
          .eq('status', 'pending')
          // Teto de tentativas: sem isto, uma conversão que nunca vai passar
          // (token revogado, conversão apagada no Google) ficaria sendo
          // reenviada para sempre, gastando cota e enchendo log.
          .lt('attempts', 5)
          .order('created_at', { ascending: true })
          .limit(LOTE);

        if (error) return json({ error: error.message }, 500);
        if (!pendentes?.length) return json({ processados: 0 });

        const { sendMetaCapiEvent } = await import('@/lib/meta-capi.server');
        let enviados = 0, falhas = 0, pulados = 0;

        for (const d of pendentes as Array<Record<string, any>>) {
          try {
            const [{ data: mapa }, { data: lead }] = await Promise.all([
              admin.from('stage_conversion_mappings')
                .select('meta_event_name, google_conversion_action, send_deal_value')
                .eq('company_id', d.company_id).eq('stage_id', d.stage_id)
                .eq('is_active', true).maybeSingle(),
              admin.from('leads')
                .select('email, phone, gclid, deal_value, deal_currency')
                .eq('id', d.lead_id).maybeSingle(),
            ]);

            // A configuração pode ter sido desligada entre enfileirar e
            // despachar. Pular é o certo: o usuário mudou de ideia.
            if (!mapa) {
              await marcar(admin, d.id, 'skipped', { motivo: 'mapeamento removido ou desligado' });
              pulados++; continue;
            }

            // A página do Facebook dona da conversa.
            //
            // A Meta EXIGE `page_id` ou `whatsapp_business_account_id` em
            // `user_data` quando a fonte é `business_messaging` — sem um dos
            // dois o evento volta 400 com subcódigo 2804116. Descoberto no
            // teste ponta a ponta, não em produção.
            const { data: pagina } = await admin
              .from('meta_lead_pages')
              .select('page_id')
              .eq('company_id', d.company_id)
              .order('created_at', { ascending: true })
              .limit(1).maybeSingle();

            // O clique de anúncio mais recente desse lead. É ele que carrega o
            // `ctwa_clid` e transforma a correspondência de probabilística em
            // determinística.
            const { data: clique } = await admin
              .from('whatsapp_ad_clicks')
              .select('ctwa_clid')
              .eq('lead_id', d.lead_id)
              .not('ctwa_clid', 'is', null)
              .order('clicked_at', { ascending: false })
              .limit(1).maybeSingle();

            let metaResultado: unknown = null;
            if (mapa.meta_event_name) {
              const r = await sendMetaCapiEvent({
                companyId: d.company_id,
                eventName: mapa.meta_event_name,
                eventId: d.event_id,
                // O instante da TRANSIÇÃO, não o do envio. O cron roda minutos
                // depois, e carimbar a hora errada desloca a atribuição.
                eventTime: Math.floor(new Date(d.occurred_at).getTime() / 1000),
                email: lead?.email ?? null,
                phone: lead?.phone ?? null,
                // Mensageria só quando há as DUAS coisas. Com clid mas sem
                // página, a Meta recusa; melhor cair no caminho de site, que
                // ainda casa por telefone, do que perder o evento inteiro.
                messaging: clique?.ctwa_clid && pagina?.page_id
                  ? { ctwaClid: clique.ctwa_clid, pageId: pagina.page_id }
                  : null,
                customData: mapa.send_deal_value && lead?.deal_value
                  ? { value: Number(lead.deal_value), currency: lead.deal_currency || 'BRL' }
                  : null,
              });
              // Guarda a RESPOSTA da Meta, não só o código. Um "meta_http_400"
              // sozinho não diz se o problema é o evento, o identificador ou o
              // dataset — e sem o corpo a investigação vira adivinhação.
              metaResultado = {
                status: r.status,
                http: r.httpStatus,
                erro: r.error ?? null,
                resposta: r.response ?? null,
              };
              if (r.ok) enviados++; else falhas++;
            }

            const ok = !mapa.meta_event_name || (metaResultado as any)?.status === 'sent';
            await admin.from('conversion_dispatches').update({
              status: ok ? 'sent' : 'failed',
              meta_result: metaResultado,
              attempts: (d.attempts ?? 0) + 1,
              dispatched_at: new Date().toISOString(),
              last_error: ok ? null : String((metaResultado as any)?.erro ?? 'falha no envio'),
            }).eq('id', d.id);

            console.info(JSON.stringify({
              scope: 'conversion-dispatch', msg: ok ? 'enviado' : 'falhou',
              company_id: d.company_id, evento: mapa.meta_event_name,
              com_ctwa_clid: Boolean(clique?.ctwa_clid),
              com_page_id: Boolean(pagina?.page_id),
            }));
          } catch (err) {
            falhas++;
            await admin.from('conversion_dispatches').update({
              status: 'failed',
              attempts: (d.attempts ?? 0) + 1,
              last_error: err instanceof Error ? err.message : String(err),
            }).eq('id', d.id);
          }
        }

        return json({ processados: pendentes.length, enviados, falhas, pulados });
      },
    },
  },
});

async function marcar(admin: any, id: string, status: string, extra: Record<string, unknown>) {
  await admin.from('conversion_dispatches')
    .update({ status, meta_result: extra, dispatched_at: new Date().toISOString() })
    .eq('id', id);
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
