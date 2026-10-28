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
  cliques_7d: number;
  /** Cliques que viraram conversa (casados com um telefone pelo código). */
  conversas: number;
  /** Leads distintos: quem clicou duas vezes conta uma. */
  leads: number;
  qualificados: number;
  vendas: number;
  valor_vendas: number;
  ultimo_clique: string | null;
}

export interface CliquePorOrigem {
  utm_source: string;
  utm_campaign: string;
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

export async function listRedirectLinks(companyId: string, dias = 30): Promise<RedirectLinkComUso[]> {
  const { data: links, error } = await (supabase as any)
    .from('redirect_links')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const lista = (links ?? []) as RedirectLink[];
  if (!lista.length) return [];

  // O funil é calculado no banco: contar no navegador parava em 1.000 linhas e
  // não tinha como seguir o clique até a etapa do lead.
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data: stats, error: erroStats } = await (supabase as any).rpc('estatisticas_dos_links', {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (erroStats) throw new Error(erroStats.message);

  const n = (v: unknown) => Number(v ?? 0);
  const porId = new Map<string, Record<string, unknown>>(
    ((stats ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.link_id), r]),
  );

  return lista.map((l) => {
    const r = porId.get(l.id);
    return {
      ...l,
      cliques: n(r?.cliques),
      cliques_7d: n(r?.cliques_7d),
      conversas: n(r?.conversas),
      leads: n(r?.leads),
      qualificados: n(r?.qualificados),
      vendas: n(r?.vendas),
      valor_vendas: n(r?.valor_vendas),
      ultimo_clique: (r?.ultimo_clique as string | null) ?? null,
    };
  });
}

export async function cliquesPorOrigem(linkId: string, dias = 30): Promise<CliquePorOrigem[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc('cliques_do_link_por_origem', {
    p_link_id: linkId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    utm_source: String(r.utm_source),
    utm_campaign: String(r.utm_campaign),
    cliques: Number(r.cliques),
    conversas: Number(r.conversas),
  }));
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
