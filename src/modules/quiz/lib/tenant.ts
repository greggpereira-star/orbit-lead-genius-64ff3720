export const ROOT_DOMAIN = 'altleadflow.com.br';

export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'ftp', 'supabase-api',
  'ns1', 'ns2', 'autoconfig', 'autodiscover', 'staging', 'dev',
]);

export const SUBDOMAIN_FORMAT = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;

/**
 * Extrai o prefixo de subdomínio de um Host, só quando é um subdomínio
 * válido de ROOT_DOMAIN (não o domínio raiz, não "www", não reservado).
 */
export function parseSubdomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const prefix = hostname.slice(0, -(`.${ROOT_DOMAIN}`.length));
  if (!prefix || prefix.includes('.') || RESERVED_SUBDOMAINS.has(prefix)) return null;
  return prefix;
}
