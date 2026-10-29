/**
 * Conversions API do Meta. Só servidor.
 *
 * O access token vive aqui e em nenhum outro lugar: quem chama do navegador é o
 * endpoint `/api/public/pixel-event`, que nunca devolve o token para a página.
 *
 * Cada evento carrega o `event_id` que o Pixel do navegador também mandou. É
 * essa chave que faz o Meta contar um lead, não dois.
 */

export interface CapiTracking {
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string;
  fbclid?: string; fbc?: string; fbp?: string;
  gclid?: string; gbraid?: string; wbraid?: string;
}

export type CapiEventName =
  | 'PageView' | 'ViewContent' | 'Lead' | 'CompleteRegistration' | 'Contact'
  // Mensageria tem nomes próprios: a Meta RECUSA `Lead` quando
  // `action_source` é `business_messaging`. E o nicho pode usar um evento
  // personalizado, por isso `string` entra na união — o nome é configuração.
  | 'LeadSubmitted' | 'QualifiedLead' | 'Purchase' | 'Schedule'
  | (string & {});

export interface MetaCapiInput {
  companyId: string;
  eventName: CapiEventName;
  /** Mesmo identificador enviado pelo Pixel no navegador. */
  eventId: string;
  eventTime?: number; // unix seconds
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  pageUrl?: string | null;
  tracking?: CapiTracking | null;
  customData?: Record<string, unknown> | null;

  /**
   * Conversa de WhatsApp vinda de anúncio.
   *
   * Quando presente, o evento sai como `business_messaging` em vez de
   * `website` — que é o caminho oficial da Meta para mensageria e o único que
   * aceita o `ctwa_clid`. Medido em 02/10 no tráfego da agência: 83 de 84
   * mensagens de anúncio trazem esse identificador.
   */
  messaging?: {
    /** Cru, NÃO hasheado. A Meta recusa o evento se vier com hash. */
    ctwaClid: string;
    /** A página do Facebook dona da conversa. */
    pageId?: string | null;
    /**
     * A conta do WhatsApp Business (WABA) dona do número. Com a API oficial é
     * ela que identifica a conversa — a Meta aceita `page_id` OU este campo, e
     * exige um dos dois quando a fonte é `business_messaging`.
     */
    whatsappBusinessAccountId?: string | null;
  } | null;

  /**
   * Ensaio: monta o payload e devolve sem chamar a Meta.
   *
   * Serve para conferir a corrente inteira contra um pixel de produção sem
   * mandar conversão para dentro do aprendizado da campanha. Devolve o payload
   * REAL — o mesmo objeto que iria no corpo do POST — porque conferir contra
   * uma reconstrução só provaria que a reconstrução está certa.
   */
  dryRun?: boolean;
}

export interface MetaCapiResult {
  ok: boolean;
  status: 'sent' | 'skipped_no_integration' | 'failed' | 'rehearsal';
  httpStatus?: number;
  response?: unknown;
  error?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface MetaPixelConfig {
  pixel_id?: string;
  access_token?: string;
  test_event_code?: string;
}

/**
 * Configuração do Pixel da empresa. Devolve `null` quando não há integração
 * utilizável — o chamador trata isso como "essa empresa não mede", não como erro.
 */
export async function getMetaPixelConfig(companyId: string): Promise<MetaPixelConfig | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('config, status')
    .eq('company_id', companyId)
    .eq('provider', 'meta')
    .maybeSingle();

  const config = (integration?.config ?? {}) as MetaPixelConfig;
  if (integration?.status !== 'connected' || !config.pixel_id || !config.access_token) return null;
  return config;
}

export async function sendMetaCapiEvent(input: MetaCapiInput): Promise<MetaCapiResult> {
  const config = await getMetaPixelConfig(input.companyId);
  if (!config) return { ok: false, status: 'skipped_no_integration' };

  const t = input.tracking ?? {};
  const userData: Record<string, unknown> = {
    client_user_agent: input.userAgent ?? undefined,
    client_ip_address: input.clientIp ?? undefined,
    fbc: t.fbc ?? (t.fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${t.fbclid}` : undefined),
    fbp: t.fbp ?? undefined,
  };
  if (input.email) userData.em = [await sha256Hex(input.email)];
  // Só dígitos: o Meta descarta o telefone se vier com parênteses ou traço.
  if (input.phone) userData.ph = [await sha256Hex(input.phone.replace(/\D+/g, ''))];

  // O `ctwa_clid` vai CRU. É a única chave aqui que não é hasheada — ela já é um
  // identificador opaco da Meta, e hashear faria o evento ser recusado.
  const mensageria = input.messaging ?? null;
  if (mensageria) aplicarMensageria(userData, mensageria);

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: mensageria ? 'business_messaging' : 'website',
        ...(mensageria ? { messaging_channel: 'whatsapp' } : {}),
        // URL de página não existe em conversa de WhatsApp.
        event_source_url: mensageria ? undefined : (input.pageUrl ?? undefined),
        user_data: userData,
        custom_data: {
          ...(input.customData ?? {}),
          utm_source: t.utm_source,
          utm_medium: t.utm_medium,
          utm_campaign: t.utm_campaign,
        },
      },
    ],
    ...(config.test_event_code ? { test_event_code: config.test_event_code } : {}),
  };

  // Depois de montar, antes de enviar. Qualquer coisa acima — hash de
  // telefone, escolha de action_source, ctwa_clid — já aconteceu e está
  // visível no payload devolvido.
  if (input.dryRun) {
    return { ok: true, status: 'rehearsal', response: { ensaio: true, pixel_id: config.pixel_id, payload } };
  }

  const url = `https://graph.facebook.com/v19.0/${config.pixel_id}/events?access_token=${encodeURIComponent(config.access_token!)}`;

  /* A rota da VPS até graph.facebook.com perde conexão de forma intermitente
     (medido em 29/10/2026: 3 de 10 conexões estouravam o timeout, e o Node
     esperava 10 s por tentativa sem repetir). Sem repetição, o `Lead` ou o
     `CompleteRegistration` daquele visitante simplesmente não saía do servidor.
     Repetir é seguro: o `event_id` é o mesmo, e o Meta deduplica. Só erro de
     rede, 429 e 5xx repetem; 4xx é erro do payload e repetir não ajuda. */
  const TENTATIVAS = 3;
  let ultimoErro = 'erro_desconhecido';
  for (let n = 1; n <= TENTATIVAS; n++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });
      const body = (await res.json().catch(() => ({}))) as unknown;
      if (res.ok) return { ok: true, status: 'sent', httpStatus: res.status, response: body };
      const repetivel = res.status === 429 || res.status >= 500;
      if (!repetivel || n === TENTATIVAS) {
        return { ok: false, status: 'failed', httpStatus: res.status, response: body, error: `meta_http_${res.status}` };
      }
      ultimoErro = `meta_http_${res.status}`;
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : String(err);
    }
    if (n < TENTATIVAS) await new Promise((r) => setTimeout(r, 300 * n));
  }
  return { ok: false, status: 'failed', error: `${ultimoErro} (após ${TENTATIVAS} tentativas)` };
}

/**
 * `user_data` de um evento de mensageria (WhatsApp vindo de anúncio).
 *
 * Pura e exportada para ser testada: é aqui que mora a regra que, quebrada,
 * devolve 400 com subcódigo 2804116 — a Meta exige `page_id` OU
 * `whatsapp_business_account_id` quando a fonte é `business_messaging`.
 */
export function aplicarMensageria(
  userData: Record<string, unknown>,
  m: { ctwaClid: string; pageId?: string | null; whatsappBusinessAccountId?: string | null },
): Record<string, unknown> {
  // O `ctwa_clid` vai CRU: é um identificador opaco da Meta; hashear faz o
  // evento ser recusado.
  userData.ctwa_clid = m.ctwaClid;
  if (m.pageId) userData.page_id = m.pageId;
  if (m.whatsappBusinessAccountId) userData.whatsapp_business_account_id = m.whatsappBusinessAccountId;
  // Num evento de mensageria não existe navegador: user agent, IP, fbc e fbp
  // inventados só pioram a correspondência.
  delete userData.client_user_agent;
  delete userData.client_ip_address;
  delete userData.fbc;
  delete userData.fbp;
  return userData;
}
