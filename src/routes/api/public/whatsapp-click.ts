import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

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

function sanitizePhone(raw: string): string {
  return raw.replace(/\D+/g, '');
}

function buildWaUrl(phone: string, message?: string): string {
  const base = `https://wa.me/${phone}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const Route = createFileRoute('/api/public/whatsapp-click')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: Payload;
        try { body = (await request.json()) as Payload; }
        catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } }); }

        const phone = body.phone ? sanitizePhone(body.phone) : '';
        if (!body.companyId || !phone) {
          return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
        }

        const traceId = `wa_${crypto.randomUUID()}`;
        const finalUrl = buildWaUrl(phone, body.message);
        const tracking = body.tracking ?? {};

        // Fail-open: even if DB write fails we still return the wa.me URL.
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

          let leadId: string | null = null;
          if (body.email || body.name) {
            const { data: lead } = await supabaseAdmin.from('leads').insert({
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
                fbp: tracking.fbp ?? null,
                fbc: tracking.fbc ?? null,
                gbraid: tracking.gbraid ?? null,
                wbraid: tracking.wbraid ?? null,
              },
            }).select('id').single();
            leadId = lead?.id ?? null;
          }

          await supabaseAdmin.from('whatsapp_click_events').insert({
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
          });

          return new Response(
            JSON.stringify({ success: true, whatsappUrl: finalUrl, leadId, traceId }),
            { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
          );
        } catch (err) {
          console.error('[whatsapp-click] persist failed', err);
          return new Response(
            JSON.stringify({ success: true, whatsappUrl: finalUrl, leadId: null, traceId, degraded: true }),
            { status: 200, headers: { ...cors, 'content-type': 'application/json' } },
          );
        }
      },
    },
  },
});
