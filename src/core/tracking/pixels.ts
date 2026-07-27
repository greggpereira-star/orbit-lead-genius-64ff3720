/**
 * Pixel do Meta e gtag do Google Ads nas páginas públicas.
 *
 * Só IDs públicos passam por aqui. O access token da Conversions API nunca sai
 * do servidor — quem envia o evento server-side é `/api/public/pixel-event`.
 *
 * Todo evento de conversão carrega um `eventId` que vai igual para os dois
 * lados. É isso que faz o Meta entender que o evento do navegador e o do
 * servidor são o MESMO — sem essa chave, cada lead publicado apareceria em
 * dobro no Gerenciador de Eventos e o custo por lead pareceria metade do real.
 */

export interface PixelConfig {
  /** ID do Pixel do Meta (ex.: 1234567890). */
  metaPixelId?: string;
  /** ID de conversão do Google Ads, com o prefixo (ex.: AW-123456789). */
  googleConversionId?: string;
  /** Rótulo da conversão disparada quando o contato é capturado. */
  googleLeadLabel?: string;
  /** Rótulo da conversão disparada quando o funil é concluído. */
  googleCompleteLabel?: string;
}

export type MetaEventName = 'PageView' | 'ViewContent' | 'Lead' | 'CompleteRegistration';

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: unknown; push?: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const META_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';

/** Pixels já inicializados nesta página — evita `init` duplicado em navegação interna. */
const initialized = new Set<string>();

function injectScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const el = document.createElement('script');
  el.id = id;
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

/**
 * Snippet oficial do Meta, escrito como código legível em vez da versão
 * minificada que se cola em HTML. Mesma mecânica: `fbq` vira uma fila até o
 * `fbevents.js` chegar e assumir.
 */
function ensureFbq() {
  if (window.fbq) return;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void).apply(fbq, args);
    else (fbq.queue as unknown[]).push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.push = fbq;
  window.fbq = fbq;
  window._fbq = fbq;
  injectScript(META_SRC, 'meta-pixel-sdk');
}

function ensureGtag(conversionId: string) {
  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    // O gtag.js lê a fila esperando o objeto `arguments` cru de cada chamada.
    // Um array comum é ignorado em silêncio — por isso nada de rest params aqui.
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    }
    window.gtag = gtag as (...args: unknown[]) => void;
    window.gtag('js', new Date());
  }
  injectScript(`${GTAG_SRC}?id=${encodeURIComponent(conversionId)}`, 'google-ads-sdk');
}

/**
 * Liga os pixels configurados para esta página. Chamar mais de uma vez é
 * seguro: só o primeiro `init` de cada ID tem efeito.
 */
export function initPixels(config: PixelConfig) {
  if (typeof window === 'undefined') return;

  if (config.metaPixelId && !initialized.has(`meta:${config.metaPixelId}`)) {
    initialized.add(`meta:${config.metaPixelId}`);
    ensureFbq();
    window.fbq!('init', config.metaPixelId);
  }

  if (config.googleConversionId && !initialized.has(`google:${config.googleConversionId}`)) {
    initialized.add(`google:${config.googleConversionId}`);
    ensureGtag(config.googleConversionId);
    window.gtag!('config', config.googleConversionId);
  }
}

/** Dispara um evento padrão do Meta no navegador. */
export function trackMeta(
  eventName: MetaEventName,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  if (typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', eventName, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/**
 * Dispara uma conversão do Google Ads.
 *
 * `transactionId` é o mesmo `eventId` do Meta. O Google usa esse campo para
 * descartar a segunda chegada do mesmo evento — por exemplo quando o visitante
 * recarrega a tela de obrigado.
 */
export function trackGoogleConversion(
  config: PixelConfig,
  label: string | undefined,
  params?: { value?: number; currency?: string; transactionId?: string },
) {
  if (typeof window === 'undefined' || !window.gtag) return;
  if (!config.googleConversionId || !label) return;
  window.gtag('event', 'conversion', {
    send_to: `${config.googleConversionId}/${label}`,
    value: params?.value,
    currency: params?.currency ?? 'BRL',
    transaction_id: params?.transactionId,
  });
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * `_fbp` e `_fbc` são os cookies que o próprio Pixel grava. Mandá-los junto na
 * Conversions API é o que sobe a qualidade da correspondência: sem eles o Meta
 * tem que casar o lead só por e-mail com hash, e boa parte não casa.
 *
 * Quando a pessoa chega por anúncio mas o Pixel ainda não gravou o `_fbc`,
 * montamos o valor a partir do `fbclid` da URL, no formato que o Meta espera.
 */
export function getFbCookies(fbclid?: string): { fbp?: string; fbc?: string } {
  const fbp = readCookie('_fbp');
  const fbc = readCookie('_fbc') ?? (fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : undefined);
  return { fbp, fbc };
}

/** Identidade do evento, compartilhada entre navegador e servidor. */
export function newEventId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `evt_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

export interface CapiEventInput {
  eventName: MetaEventName;
  eventId: string;
  /* A empresa é derivada do funil no servidor — mandá-la daqui não teria valor,
     já que um payload de página pública não é fonte confiável para isso. */
  quizId?: string;
  formId?: string;
  email?: string;
  phone?: string;
  pageUrl?: string;
  fbp?: string;
  fbc?: string;
  tracking?: Record<string, string>;
  customData?: Record<string, unknown>;
}

/**
 * Espelha no servidor o evento que acabou de sair pelo navegador.
 *
 * Fire-and-forget de propósito: bloqueador de anúncio, aba fechada ou rede ruim
 * não podem segurar o avanço do funil. O que se perde aqui é uma medição, não
 * o lead — esse já está gravado por outro caminho.
 */
export function sendCapiEvent(input: CapiEventInput): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify(input);
  try {
    // `keepalive` é o que permite o envio sobreviver ao fechamento da aba —
    // justamente o caso do evento de conclusão, disparado junto com o redirect.
    void fetch('/api/public/pixel-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* medição nunca derruba o funil */
  }
}
