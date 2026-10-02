import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Redirect de anúncio → WhatsApp, com código curto.
 *
 * O Google Ads não tem botão nativo de WhatsApp. Sem esta página o `gclid`
 * morre no clique e o lead chega na conversa sem origem — o anunciante paga e
 * não sabe por quê. Aqui o clique é gravado, ganha um código curto, e a pessoa
 * segue para o WhatsApp com esse código já digitado. Quando a mensagem chega, o
 * código amarra a conversa ao clique.
 *
 * Roda no SERVIDOR, no `beforeLoad`, e devolve um 302 de verdade. Fazer isso no
 * navegador obrigaria a carregar o React só para redirecionar: mais lento, e
 * quem bloqueia script ficaria preso numa página em branco.
 */

/** Sem 0/O e 1/I/L: o código é lido em voz alta e digitado por gente. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function gerarCodigo(tamanho = 5): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

export const Route = createFileRoute('/ir/$slug')({
  beforeLoad: async ({ params, location }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const admin = supabaseAdmin as any;

    const { data: link } = await admin
      .from('redirect_links')
      .select('id, company_id, destino_phone, mensagem, is_active')
      .eq('slug', params.slug)
      .maybeSingle();

    // Link inexistente ou desligado manda para a home em vez de mostrar erro: a
    // pessoa clicou num anúncio, não quer depurar nada.
    if (!link?.is_active) throw redirect({ to: '/', statusCode: 302 });

    const q = new URLSearchParams(location.searchStr ?? '');
    const pegar = (k: string) => q.get(k)?.trim() || null;

    const codigo = gerarCodigo();

    // Best-effort: se o banco falhar, o visitante ainda tem que chegar no
    // WhatsApp. Perder atribuição é ruim; perder o lead é pior.
    try {
      await admin.from('whatsapp_ad_clicks').insert({
        company_id: link.company_id,
        link_id: link.id,
        origem: 'redirect',
        short_code: codigo,
        gclid: pegar('gclid') ?? pegar('wbraid') ?? pegar('gbraid'),
        fbclid: pegar('fbclid'),
        utm_source: pegar('utm_source'),
        utm_medium: pegar('utm_medium'),
        utm_campaign: pegar('utm_campaign'),
        utm_content: pegar('utm_content'),
        utm_term: pegar('utm_term'),
        clicked_at: new Date().toISOString(),
      });
    } catch {
      // Silêncio proposital: o redirect não pode falhar por causa do registro.
    }

    const texto = (link.mensagem || 'Olá! Vim pelo anúncio. [{{codigo}}]')
      .replace(/\{\{\s*codigo\s*\}\}/gi, codigo);

    const destino = `https://wa.me/${String(link.destino_phone).replace(/\D+/g, '')}?text=${encodeURIComponent(texto)}`;
    throw redirect({ href: destino, statusCode: 302 });
  },
});
