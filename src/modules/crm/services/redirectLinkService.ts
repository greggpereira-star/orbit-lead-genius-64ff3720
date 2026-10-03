/**
 * Links de redirect de anúncio.
 *
 * O Google Ads não tem botão nativo de WhatsApp: o anúncio aponta para um link
 * nosso, que identifica o clique e encaminha. Sem uma tela, o recurso existe no
 * servidor e ninguém consegue usar.
 */
import { supabase } from '@/integrations/supabase/client';

export interface RedirectLink {
  id: string;
  company_id: string;
  slug: string;
  nome: string;
  destino_phone: string;
  mensagem: string;
  is_active: boolean;
  created_at: string;
}

export interface RedirectLinkComUso extends RedirectLink {
  cliques: number;
  conversas: number;
}

/**
 * Transforma "Campanha Sol e Mar — Julho" em "campanha-sol-e-mar-julho".
 *
 * O slug vai na URL do anúncio, então acento e espaço viram escape ilegível e
 * quebram quando alguém copia de um PDF ou de uma mensagem.
 */
export function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function listRedirectLinks(companyId: string): Promise<RedirectLinkComUso[]> {
  const { data: links, error } = await (supabase as any)
    .from('redirect_links')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const lista = (links ?? []) as RedirectLink[];
  if (!lista.length) return [];

  // Contagem de uso numa consulta só. O número de cliques é a única prova de que
  // o link está no ar e funcionando — sem ele a tela não diz se alguém clicou.
  const { data: cliques } = await (supabase as any)
    .from('whatsapp_ad_clicks')
    .select('link_id, phone')
    .in('link_id', lista.map((l) => l.id));

  const porLink = new Map<string, { cliques: number; conversas: number }>();
  for (const c of (cliques ?? []) as Array<{ link_id: string; phone: string | null }>) {
    const atual = porLink.get(c.link_id) ?? { cliques: 0, conversas: 0 };
    atual.cliques += 1;
    // Clique com telefone virou conversa de verdade; sem telefone, a pessoa
    // clicou e não mandou mensagem. A diferença entre os dois é o vazamento.
    if (c.phone) atual.conversas += 1;
    porLink.set(c.link_id, atual);
  }

  return lista.map((l) => ({ ...l, ...(porLink.get(l.id) ?? { cliques: 0, conversas: 0 }) }));
}

export async function criarRedirectLink(input: {
  companyId: string;
  nome: string;
  destinoPhone: string;
  mensagem: string;
}): Promise<void> {
  const slug = gerarSlug(input.nome);
  if (!slug) throw new Error('Dê um nome que gere um endereço válido.');

  const telefone = input.destinoPhone.replace(/\D+/g, '');
  // 12 dígitos = DDI 55 + DDD + 8. Abaixo disso o wa.me abre numa conversa vazia
  // e o anunciante só descobre quando o lead reclama que não chegou ninguém.
  if (telefone.length < 12) {
    throw new Error('O número precisa do código do país e do DDD. Ex.: 5527999998888');
  }

  const { error } = await (supabase as any).from('redirect_links').insert({
    company_id: input.companyId,
    slug,
    nome: input.nome.trim(),
    destino_phone: telefone,
    mensagem: input.mensagem.trim() || 'Olá! Vim pelo anúncio. [{{codigo}}]',
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error(`Já existe um link com o endereço "${slug}". Mude o nome.`);
    }
    throw new Error(error.message);
  }
}

export async function alternarRedirectLink(id: string, ativo: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('redirect_links')
    .update({ is_active: ativo, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirRedirectLink(id: string): Promise<void> {
  const { error } = await (supabase as any).from('redirect_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
