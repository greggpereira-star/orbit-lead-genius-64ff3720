/**
 * Visitante automático (verificador de anúncio, prévia de link, buscador).
 *
 * O link de anúncio é aberto por máquinas antes de qualquer pessoa: o Google Ads
 * confere o destino de cada anúncio, o WhatsApp e o Facebook montam a prévia ao
 * colar o endereço. Se cada abertura virasse um clique, o número de cliques
 * cresceria sem ninguém ter clicado, e cada um ainda gastaria um código curto.
 *
 * Esses visitantes continuam sendo redirecionados normalmente (a verificação do
 * anúncio precisa seguir o destino); só não são contados.
 */
const PADROES_DE_ROBO: RegExp[] = [
  /adsbot-google/i,
  /googlebot/i,
  /mediapartners-google/i,
  /google-read-aloud|google-inspectiontool|apis-google/i,
  /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher/i,
  /^whatsapp\//i, // prévia de link; o navegador interno do WhatsApp usa UA de navegador comum
  /telegrambot|twitterbot|slackbot|linkedinbot|discordbot|skypeuripreview/i,
  /bingbot|bingpreview|applebot|duckduckbot|yandexbot|baiduspider|semrushbot|ahrefsbot/i,
  /headlesschrome|python-requests|curl\/|wget\/|go-http-client|node-fetch|axios\//i,
];

/** UA ausente conta como pessoa: melhor contar um clique a mais do que perder um lead real. */
export function ehRobo(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return PADROES_DE_ROBO.some((p) => p.test(userAgent));
}
