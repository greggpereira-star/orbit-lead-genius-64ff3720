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
    // Sem `allow_enhanced_conversions`, o `user_data` que mandamos junto da
    // conversão é ignorado — e a conversão otimizada não sai do papel.
    window.gtag!('config', config.googleConversionId, { allow_enhanced_conversions: true });
  }
}

/* ============ Dados de contato com hash ============
 *
 * Meta e Google só aceitam contato em SHA-256, e cada um exige a sua
 * normalização. Errar a normalização não dá erro: o evento é aceito e
 * simplesmente não casa com ninguém — o pior tipo de falha, porque parece que
 * está funcionando.
 */

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Telefone em E.164, sem o `+`.
 *
 * Quem digita num quiz brasileiro escreve "(11) 99999-9999" — 10 ou 11
 * dígitos, sem país. Mandar assim não casa com ninguém, porque as plataformas
 * esperam o código do país. Números que já vêm com 12+ dígitos são deixados
 * como estão: ou já têm o país, ou não é um número brasileiro para adivinhar.
 */
function normalizePhone(phone: string): string | undefined {
  const digits = phone.replace(/\D+/g, '');
  if (!digits) return undefined;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export interface HashedContact { em?: string; ph?: string }

export async function hashContact(contact: { email?: string; phone?: string }): Promise<HashedContact> {
  const out: HashedContact = {};
  if (typeof crypto === 'undefined' || !crypto.subtle) return out;
  if (contact.email?.trim()) out.em = await sha256Hex(normalizeEmail(contact.email));
  const phone = contact.phone ? normalizePhone(contact.phone) : undefined;
  if (phone) out.ph = await sha256Hex(phone);
  return out;
}

/**
 * Correspondência avançada do Meta.
 *
 * Um `init` posterior com `em`/`ph` atualiza os dados de correspondência da
 * página — é o caminho documentado para quando o contato só aparece no meio do
 * funil, que é exatamente o nosso caso. Os eventos disparados depois disto
 * levam o contato junto.
 */
export function setMetaAdvancedMatching(pixelId: string | undefined, hashed: HashedContact) {
  if (typeof window === 'undefined' || !window.fbq || !pixelId) return;
  if (!hashed.em && !hashed.ph) return;
  window.fbq('init', pixelId, {
    ...(hashed.em ? { em: hashed.em } : {}),
    ...(hashed.ph ? { ph: hashed.ph } : {}),
  });
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
 *
 * O `user_data` vai num `set` separado, antes do evento, porque é assim que o
 * gtag espera receber a conversão otimizada; passar no próprio evento não tem
 * efeito. As chaves com prefixo `sha256_` avisam que o valor já vem com hash —
 * sem elas o Google tentaria fazer o hash de um hash.
 */
export function trackGoogleConversion(
  config: PixelConfig,
  label: string | undefined,
  params?: { value?: number; currency?: string; transactionId?: string; hashed?: HashedContact },
) {
  if (typeof window === 'undefined' || !window.gtag) return;
  if (!config.googleConversionId || !label) return;

  const hashed = params?.hashed;
  const userData = hashed?.em || hashed?.ph
    ? {
        ...(hashed.em ? { sha256_email_address: hashed.em } : {}),
        ...(hashed.ph ? { sha256_phone_number: hashed.ph } : {}),
      }
    : undefined;

  // O Google aceita o dado de usuário por dois caminhos, e eles não são
  // equivalentes na prática: o `set` vale para tudo que vier depois, e o campo
  // no próprio evento é o que a documentação atual recomenda. Mandamos pelos
  // dois porque a conta do cliente pode estar em qualquer um dos dois modos, e
  // o custo de duplicar é zero — o Google usa o mesmo dado uma vez só.
  if (userData) window.gtag('set', 'user_data', userData);

  window.gtag('event', 'conversion', {
    send_to: `${config.googleConversionId}/${label}`,
    value: params?.value,
    currency: params?.currency ?? 'BRL',
    transaction_id: params?.transactionId,
    ...(userData ? { user_data: userData } : {}),
  });
}

/**
 * Publica o evento no `dataLayer` com nome próprio.
 *
 * O gtag usa o `dataLayer` para o que é dele, mas não deixa nada que sirva de
 * gatilho no Google Tag Manager. Quem monta as tags pelo GTM — o caso comum de
 * agência — não tinha em que se pendurar. O prefixo `altflow_` evita colidir
 * com eventos de outras ferramentas no mesmo dataLayer.
 */
export function pushDataLayer(event: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event: `altflow_${event}`, ...(payload ?? {}) });
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
