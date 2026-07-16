import { createFileRoute } from '@tanstack/react-router';

type Tracking = Partial<Record<
  'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term'
  | 'fbclid' | 'fbc' | 'fbp' | 'gclid' | 'gbraid' | 'wbraid',
  string
>>;

interface Payload {
  companyId: string;
  phone: string;
  message?: string;
  name?: string;
  email?: string;
  visitorId?: string;
  sessionId?: string;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  tracking?: Tracking;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const sanitizePhone = (raw: string) => raw.replace(/\D+/g, '');
const buildWaUrl = (phone: string, msg?: string) =>
  msg ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/${phone}`;

function log(level: 'info' | 'warn' | 'error', traceId: string, msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, scope: 'whatsapp-click', trace_id: traceId, msg, ...extra }));
}

export const Route = createFileRoute('/api/public/whatsapp-click')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const traceId = `wa_${crypto.randomUUID()}`;
        const eventId = crypto.randomUUID();

        let body: Payload;
        try { body = (await request.json()) as Payload; }
        catch {
          log('warn', traceId, 'invalid_json');
          return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
        }

        const phone = body.phone ? sanitizePhone(body.phone) : '';
        if (!body.companyId || !phone) {
          log('warn', traceId, 'missing_fields');
          return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
        }

        const finalUrl = buildWaUrl(phone, body.message);
        const tracking = body.tracking ?? {};
        const clientIp =
          request.headers.get('cf-connecting-ip') ??
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          null;
        const t0 = Date.now();

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

          let leadId: string | null = null;
          if (body.email || body.name) {
            const { data: lead, error: leadErr } = await supabaseAdmin.from('leads').insert({
              company_id: body.companyId,
              name: body.name ?? body.email ?? 'Visitante WhatsApp',
              email: body.email ?? null,
              phone: null,
              source: 'whatsapp_widget',
              status: 'new',
              score: 0,
              temperature: 'warm',
              landing_page: body.pageUrl ?? null,
              referrer: body.referrer ?? null,
              utm_source: tracking.utm_source ?? null,
              utm_medium: tracking.utm_medium ?? null,
              utm_campaign: tracking.utm_campaign ?? null,
              utm_content: tracking.utm_content ?? null,
              utm_term: tracking.utm_term ?? null,
              gclid: tracking.gclid ?? null,
              fbclid: tracking.fbclid ?? null,
              metadata: {
                origin: 'whatsapp_widget',
                visitor_id: body.visitorId ?? null,
                trace_id: traceId,
                event_id: eventId,
                fbp: tracking.fbp ?? null,
                fbc: tracking.fbc ?? null,
                gbraid: tracking.gbraid ?? null,
                wbraid: tracking.wbraid ?? null,
              },
            }).select('id').single();
            if (leadErr) log('warn', traceId, 'lead_insert_failed', { error: leadErr.message });
            leadId = lead?.id ?? null;
          }

          const { data: click, error: clickErr } = await supabaseAdmin.from('whatsapp_click_events').insert({
            company_id: body.companyId,
            lead_id: leadId,
            visitor_id: body.visitorId ?? null,
            session_id: body.sessionId ?? null,
            phone_destination: phone,
            message: body.message ?? null,
            final_url: finalUrl,
            page_url: body.pageUrl ?? null,
            referrer: body.referrer ?? null,
            user_agent: body.userAgent ?? request.headers.get('user-agent'),
            tracking,
            trace_id: traceId,
            event_id: eventId,
            capi_status: 'pending',
          }).select('id').single();

          if (clickErr) log('error', traceId, 'click_insert_failed', { error: clickErr.message });

          // Meta CAPI (fail-open, non-blocking outcome). Dedup via event_id shared with client-side Pixel.
          const { sendWhatsAppCapi } = await import('@/lib/whatsapp-capi.server');
          const capi = await sendWhatsAppCapi({
            companyId: body.companyId,
            eventId,
            traceId,
            email: body.email ?? null,
            phone: null, // widget doesn't collect phone; would be hashed if it did
            clientIp,
            userAgent: body.userAgent ?? request.headers.get('user-agent'),
            pageUrl: body.pageUrl ?? null,
            tracking,
          });

          if (click?.id) {
            const patch: Record<string, unknown> = {
              capi_status: capi.ok ? 'sent' : capi.status === 'skipped_no_integration' ? 'skipped' : 'retry',
              capi_attempts: 1,
              capi_last_error: capi.ok ? null : capi.error ?? null,
              capi_sent_at: capi.ok ? new Date().toISOString() : null,
              capi_response: capi.response ?? null,
            };
            await supabaseAdmin.from('whatsapp_click_events').update(patch).eq('id', click.id);
          }

          log(capi.ok ? 'info' : capi.status === 'skipped_no_integration' ? 'info' : 'warn', traceId,
            capi.ok ? 'capi_sent' : `capi_${capi.status}`,
            { lead_id: leadId, event_id: eventId, ms: Date.now() - t0, http: capi.httpStatus, error: capi.error });

          return new Response(
            JSON.stringify({ success: true, whatsappUrl: finalUrl, leadId, traceId, eventId, capi: capi.status }),
            { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
          );
        } catch (err) {
          log('error', traceId, 'persist_failed', { error: err instanceof Error ? err.message : String(err) });
          return new Response(
            JSON.stringify({ success: true, whatsappUrl: finalUrl, leadId: null, traceId, degraded: true }),
            { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
          );
        }
      },
    },
  },
});
