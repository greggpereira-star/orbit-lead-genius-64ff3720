/**
 * De onde o visitante veio, para o lead guardar.
 *
 * Medido nesta base em 14/10: dos 10 leads do Alt Quiz, NENHUM tinha
 * `landing_page` ou `referrer`. Não era falta de tráfego pago — a página de
 * entrada existe em qualquer acesso. O quiz montava o `tracking` só a partir
 * da query string (`utm_*`, `fbclid`, `gclid`), e nada no cliente escrevia
 * as duas chaves que `quiz_capture_lead` lê. As colunas existiam e ficavam
 * vazias para todo lead.
 *
 * Função pura, sem tocar em `window`: quem chama passa o que leu. É o que
 * permite provar a regra sem navegador.
 */

const LIMITE = 500;

export interface LocalizacaoMinima {
  origin: string;
  pathname: string;
}

/**
 * `landing_page` e `referrer`, prontos para entrar no `tracking`.
 *
 * - `landing_page` é o CAMINHO, sem query string: é como o rastreador do resto
 *   do produto já grava (`window.location.pathname`), e assim o mesmo quiz
 *   agrupa junto, venha o clique de onde vier. O que identifica a campanha já
 *   vai nas chaves `utm_*` e nos ids de clique.
 *
 * - `referrer` vem inteiro, mas some quando é do PRÓPRIO site: navegação
 *   interna (o autor abrindo o link pelo painel, por exemplo) não diz nada
 *   sobre aquisição, e ocuparia o campo com ruído.
 *
 * Chave sem valor não entra: o `coalesce` do banco trata ausente e vazio de
 * jeitos diferentes, e ausente é o que preserva um valor já gravado.
 */
export function origemDaVisita(
  local: LocalizacaoMinima,
  referrer: string | null | undefined,
): Record<string, string> {
  const origem: Record<string, string> = {};

  const caminho = local.pathname?.trim();
  if (caminho) origem.landing_page = caminho.slice(0, LIMITE);

  const ref = (referrer ?? "").trim();
  if (ref && !ehDoMesmoSite(ref, local.origin)) {
    origem.referrer = ref.slice(0, LIMITE);
  }

  return origem;
}

function ehDoMesmoSite(referrer: string, origin: string): boolean {
  try {
    return new URL(referrer).origin === new URL(origin).origin;
  } catch {
    // Referrer que não é URL válida: melhor guardar do que descartar calado.
    return false;
  }
}
