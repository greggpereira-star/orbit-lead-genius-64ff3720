import { createFileRoute } from '@tanstack/react-router';

/**
 * Reprocessa eventos de Lead Ads que falharam na gravação.
 *
 * Existia um retry (`/api/public/cron/meta-retry`) mas ele lê
 * `meta_lead_import_jobs` — a importação em LOTE. O webhook por lead grava em
 * `meta_lead_events`, e nada jamais reprocessava essa tabela: um evento que
 * falhasse ficava `failed` para sempre.
 *
 * Isso ficou visível em 04/10/2026: o gatilho `leads_historico_de_etapa`
 * derrubava todo INSERT em `leads` desde 03/10, e 10 eventos ficaram parados
 * com `Failed to insert lead`. O lead em si nunca chegou a ser buscado — mas o
 * `leadgen_id` está guardado, e é com ele que a Graph API devolve o contato.
 *
 * `processMetaLeadEvent` já é idempotente: evento com status `processed` é
 * pulado. Rodar isto duas vezes não duplica nada.
 */

const LOTE = 25;

interface EventoFalho {
  id: string;
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  ad_id: string | null;
  raw_payload: any;
  created_at: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const Route = createFileRoute('/api/public/cron/meta-reprocess-failed')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env.CRON_SECRET || 'altflow_retry_sync_secret';
        if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { processMetaLeadEvent } = await import('@/lib/meta-lead-processor.server');
        const admin = supabaseAdmin as any;

        const { data: falhos, error } = await admin
          .from('meta_lead_events')
          .select('id, leadgen_id, page_id, form_id, ad_id, raw_payload, created_at')
          .eq('status', 'failed')
          .order('created_at', { ascending: true })
          .limit(LOTE);

        if (error) return json({ error: error.message }, 500);
        if (!falhos?.length) return json({ reprocessados: 0, detalhe: 'nenhum evento falho' });

        const resultados: Array<Record<string, unknown>> = [];
        let recuperados = 0;
        let aindaFalhos = 0;

        for (const ev of falhos as EventoFalho[]) {
          // O valor do webhook é a fonte; as colunas são cópia e podem estar
          // vazias se a gravação tiver parado antes de preenchê-las.
          const v = ev.raw_payload?.value ?? {};
          try {
            const r = await processMetaLeadEvent(admin, {
              leadgenId: ev.leadgen_id || v.leadgen_id,
              pageId: ev.page_id || v.page_id,
              formId: ev.form_id ?? v.form_id ?? undefined,
              adId: ev.ad_id ?? v.ad_id ?? undefined,
              createdTime: v.created_time
                ? new Date(Number(v.created_time) * 1000).toISOString()
                : ev.created_at,
              rawPayload: ev.raw_payload,
            });

            resultados.push({ leadgen_id: ev.leadgen_id, status: r.status, lead_id: r.leadId, erro: r.error });
            if (r.status === 'processed') recuperados++;
            else aindaFalhos++;
          } catch (err) {
            aindaFalhos++;
            resultados.push({
              leadgen_id: ev.leadgen_id,
              status: 'exception',
              erro: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return json({ reprocessados: falhos.length, recuperados, ainda_falhos: aindaFalhos, resultados });
      },
    },
  },
});
