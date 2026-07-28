import { createFileRoute } from '@tanstack/react-router';
import { sendMetaCapiEvent, type CapiEventName } from '@/lib/meta-capi.server';

/**
 * Espelho server-side dos eventos do Pixel.
 *
 * Existe por dois motivos que o navegador sozinho não resolve:
 *   1. O access token da Conversions API não pode chegar ao navegador. Aqui ele
 *      é lido do banco com a chave de serviço e nunca volta na resposta.
 *   2. Bloqueador de anúncio derruba o `fbevents.js` de boa parte dos
 *      visitantes. O evento que sai daqui não passa pelo navegador deles.
 *
 * O `eventId` chega do navegador de propósito: é o mesmo que o Pixel usou, e é
 * o que faz o Meta juntar os dois envios num evento só.
 */

interface Payload {
  companyId?: string;
  quizId?: string;
  formId?: string;
  eventName?: string;
  eventId?: string;
  email?: string;
  phone?: string;
  pageUrl?: string;
  fbp?: string;
  fbc?: string;
  tracking?: Record<string, string>;
  customData?: Record<string, unknown>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/**
 * Lista fechada. Sem ela, qualquer um poderia postar nomes de evento
 * arbitrários no Pixel da empresa e sujar as otimizações de campanha.
 */
const ALLOWED: readonly CapiEventName[] = ['PageView', 'ViewContent', 'Lead', 'CompleteRegistration'];

/**
 * A empresa vem do funil, nunca do corpo da requisição — senão bastaria trocar
 * o `companyId` no payload para disparar eventos no Pixel de outro assinante.
 * O `companyId` enviado pelo navegador só é aceito quando bate com o do funil.
 */
async function resolveCompanyId(body: Payload): Promise<string | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  if (body.quizId) {
    const { data } = await supabaseAdmin
      .from('quiz_funnels')
      .select('company_id')
      .eq('id', body.quizId)
      .maybeSingle();
    return (data as { company_id?: string } | null)?.company_id ?? null;
  }

  if (body.formId) {
    const { data } = await supabaseAdmin
      .from('forms')
      .select('company_id')
      .eq('id', body.formId)
      .maybeSingle();
    return (data as { company_id?: string } | null)?.company_id ?? null;
  }

  return null;
}

export const Route = createFileRoute('/api/public/pixel-event')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: Payload;
        try {
          body = (await request.json()) as Payload;
        } catch {
          return json({ error: 'invalid_json' }, 400);
        }

        const eventName = body.eventName as CapiEventName | undefined;
        if (!eventName || !ALLOWED.includes(eventName)) return json({ error: 'invalid_event' }, 400);
        if (!body.eventId) return json({ error: 'missing_event_id' }, 400);

        const companyId = await resolveCompanyId(body);
        if (!companyId) return json({ error: 'unknown_funnel' }, 404);

        const clientIp =
          request.headers.get('cf-connecting-ip') ??
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          null;

        const result = await sendMetaCapiEvent({
          companyId,
          eventName,
          eventId: body.eventId,
          email: body.email ?? null,
          phone: body.phone ?? null,
          clientIp,
          userAgent: request.headers.get('user-agent'),
          pageUrl: body.pageUrl ?? null,
          tracking: { ...(body.tracking ?? {}), fbp: body.fbp, fbc: body.fbc },
          customData: body.customData ?? null,
        });

        // Conversão de LEAD no Google Ads, no mesmo instante do `Lead` do Meta.
        //
        // Vai daqui, e não de um cron, porque é aqui que o `gclid` da URL ainda
        // existe: ele chega no `tracking` do navegador. Fire-and-forget — o
        // visitante não espera pelo Google Ads.
        if (eventName === 'Lead') {
          void (async () => {
            try {
              const { enviarConversaoGoogle } = await import('@/lib/google-ads.server');
              const r = await enviarConversaoGoogle({
                companyId,
                tipo: 'lead',
                leadId: body.eventId!,
                gclid: body.tracking?.gclid ?? null,
                email: body.email ?? null,
                phone: body.phone ?? null,
              });
              if (r.status === 'falhou') {
                console.error(JSON.stringify({
                  scope: 'pixel-event', msg: 'google_conversao_falhou',
                  company_id: companyId, detalhe: r.detalhe,
                }));
              }
            } catch (err) {
              console.error(JSON.stringify({
                scope: 'pixel-event', msg: 'google_conversao_excecao',
                erro: err instanceof Error ? err.message : String(err),
              }));
            }
          })();
        }

        if (result.status === 'failed') {
          // Logado, não devolvido: a resposta do Meta pode citar o pixel e a
          // conta, e quem chama é uma página pública.
          console.error(JSON.stringify({
            scope: 'pixel-event', msg: 'capi_failed', event: eventName,
            company_id: companyId, http: result.httpStatus, error: result.error,
          }));
        }

        // Sempre 200: para o visitante, medição que falhou não é erro de página.
        return json({ status: result.status });
      },
    },
  },
});
