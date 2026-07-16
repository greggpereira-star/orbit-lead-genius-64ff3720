/**
 * Meta Conversions API sender for WhatsApp click events.
 * Server-only. Dedup via event_id, retry-friendly (updates row in place).
 */

interface Tracking {
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string;
  fbclid?: string; fbc?: string; fbp?: string;
  gclid?: string; gbraid?: string; wbraid?: string;
}

export interface WaCapiInput {
  companyId: string;
  eventId: string;
  traceId: string;
  eventTime?: number; // unix seconds
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  pageUrl?: string | null;
  tracking?: Tracking | null;
}

export interface WaCapiResult {
  ok: boolean;
  status: 'sent' | 'skipped_no_integration' | 'failed';
  httpStatus?: number;
  response?: unknown;
  error?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendWhatsAppCapi(input: WaCapiInput): Promise<WaCapiResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('config, status')
    .eq('company_id', input.companyId)
    .eq('provider', 'meta')
    .maybeSingle();

  const config = (integration?.config ?? {}) as { pixel_id?: string; access_token?: string; test_event_code?: string };
  if (integration?.status !== 'connected' || !config.pixel_id || !config.access_token) {
    return { ok: false, status: 'skipped_no_integration' };
  }

  const t = input.tracking ?? {};
  const userData: Record<string, unknown> = {
    client_user_agent: input.userAgent ?? undefined,
    client_ip_address: input.clientIp ?? undefined,
    fbc: t.fbc ?? (t.fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${t.fbclid}` : undefined),
    fbp: t.fbp ?? undefined,
  };
  if (input.email) userData.em = [await sha256Hex(input.email)];
  if (input.phone) userData.ph = [await sha256Hex(input.phone.replace(/\D+/g, ''))];

  const payload = {
    data: [
      {
        event_name: 'Contact',
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId, // dedup key shared with client-side Pixel
        action_source: 'website',
        event_source_url: input.pageUrl ?? undefined,
        user_data: userData,
        custom_data: {
          lead_event_source: 'whatsapp_widget',
          content_name: 'whatsapp_click',
          utm_source: t.utm_source,
          utm_medium: t.utm_medium,
          utm_campaign: t.utm_campaign,
        },
      },
    ],
    ...(config.test_event_code ? { test_event_code: config.test_event_code } : {}),
  };

  const url = `https://graph.facebook.com/v19.0/${config.pixel_id}/events?access_token=${encodeURIComponent(config.access_token)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      return { ok: false, status: 'failed', httpStatus: res.status, response: body, error: `meta_http_${res.status}` };
    }
    return { ok: true, status: 'sent', httpStatus: res.status, response: body };
  } catch (err) {
    return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
