import { createFileRoute } from '@tanstack/react-router';

const MAX_ATTEMPTS = 5;
const BATCH = 25;

function log(level: 'info' | 'warn' | 'error', traceId: string, msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, scope: 'whatsapp-capi-retry', trace_id: traceId, msg, ...extra }));
}

export const Route = createFileRoute('/api/public/whatsapp-capi-retry')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const traceId = `retry_${crypto.randomUUID()}`;

        // Simple bearer to prevent public abuse; PUBLIC_APP_URL/retry secret shared with cron.
        const authHeader = request.headers.get('authorization') ?? '';
        const expected = process.env.WA_CAPI_RETRY_SECRET;
        if (expected && authHeader !== `Bearer ${expected}`) {
          return new Response('unauthorized', { status: 401 });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { sendWhatsAppCapi } = await import('@/lib/whatsapp-capi.server');

        const { data: rows, error } = await supabaseAdmin
          .from('whatsapp_click_events')
          .select('id, company_id, event_id, trace_id, page_url, user_agent, tracking, capi_attempts, created_at')
          .in('capi_status', ['pending', 'retry'])
          .lt('capi_attempts', MAX_ATTEMPTS)
          .order('created_at', { ascending: true })
          .limit(BATCH);

        if (error) {
          log('error', traceId, 'select_failed', { error: error.message });
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ id: string; status: string }> = [];
        for (const row of rows ?? []) {
          const attempts = (row.capi_attempts ?? 0) + 1;
          const capi = await sendWhatsAppCapi({
            companyId: row.company_id,
            eventId: row.event_id as string,
            traceId: (row.trace_id as string) ?? traceId,
            pageUrl: row.page_url,
            userAgent: row.user_agent,
            tracking: row.tracking as never,
          });

          const finalStatus =
            capi.ok ? 'sent'
              : capi.status === 'skipped_no_integration' ? 'skipped'
              : attempts >= MAX_ATTEMPTS ? 'dead_letter'
              : 'retry';

          await supabaseAdmin.from('whatsapp_click_events').update({
            capi_status: finalStatus,
            capi_attempts: attempts,
            capi_last_error: capi.ok ? null : capi.error ?? null,
            capi_sent_at: capi.ok ? new Date().toISOString() : null,
            capi_response: (capi.response ?? null) as never,
          }).eq('id', row.id);

          if (finalStatus === 'dead_letter') {
            await supabaseAdmin.from('whatsapp_capi_dlq').insert({
              company_id: row.company_id,
              click_event_id: row.id,
              event_id: row.event_id,
              trace_id: (row.trace_id as string) ?? traceId,
              attempts,
              last_error: capi.error ?? null,
              payload: { tracking: row.tracking, page_url: row.page_url } as never,
            });
          }

          results.push({ id: row.id, status: finalStatus });
          log(capi.ok ? 'info' : 'warn', (row.trace_id as string) ?? traceId, `capi_retry_${finalStatus}`, {
            attempts, event_id: row.event_id, error: capi.error,
          });
        }

        return Response.json({ ok: true, processed: results.length, results, trace_id: traceId });
      },
    },
  },
});
