/**
 * Meta Graph API v25 helpers — server-only.
 * Do not import from route/component modules directly; use through server fns.
 */

export const META_API_VERSION = "v25.0";
/**
 * Só para ensaio local: `META_GRAPH_BASE_URL` aponta a Graph API para um servidor
 * de mentira (scripts/ensaio-local/meta-falsa.mjs). Só vale para localhost: um
 * valor de outro host é ignorado, para um engano de configuração nunca mandar o
 * token da Meta para um servidor que não é a Meta.
 */
export function baseDaGraph(env: Record<string, string | undefined> = process.env): string {
  const padrao = `https://graph.facebook.com/${META_API_VERSION}`;
  const desvio = env.META_GRAPH_BASE_URL;
  if (!desvio) return padrao;
  try {
    const u = new URL(desvio);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return local && (u.protocol === "http:" || u.protocol === "https:")
      ? desvio.replace(/\/+$/, "")
      : padrao;
  } catch {
    return padrao;
  }
}
export const META_GRAPH_BASE = baseDaGraph();

export interface GraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaGraphError extends Error {
  status: number;
  graph?: GraphError;
  constructor(message: string, status: number, graph?: GraphError) {
    super(message);
    this.status = status;
    this.graph = graph;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: init.body,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || json.error) {
    throw new MetaGraphError(
      json?.error?.message ?? `Graph request failed [${res.status}]`,
      res.status,
      json?.error,
    );
  }
  return json as T;
}

export interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<TokenExchangeResponse> {
  return request<TokenExchangeResponse>("/oauth/access_token", {
    query: {
      client_id: params.appId,
      client_secret: params.appSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    },
  });
}

export async function exchangeForLongLivedToken(params: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<TokenExchangeResponse> {
  return request<TokenExchangeResponse>("/oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: params.appId,
      client_secret: params.appSecret,
      fb_exchange_token: params.shortLivedToken,
    },
  });
}

export async function getMe(accessToken: string): Promise<{ id: string; name: string }> {
  return request("/me", { query: { access_token: accessToken, fields: "id,name" } });
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
}

export async function listUserPages(accessToken: string): Promise<MetaPage[]> {
  const paginas: MetaPage[] = [];
  let depois: string | undefined;
  // Quem cuida de muitos clientes passa de 100 páginas; sem seguir o cursor as seguintes sumiam
  // da lista de escolha. Teto de 10 páginas de resultado, como na lista de contas de anúncio.
  for (let pagina = 0; pagina < 10; pagina++) {
    const res = await request<{
      data?: MetaPage[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/me/accounts", {
      query: {
        access_token: accessToken,
        fields: "id,name,access_token,category,tasks",
        limit: "100",
        after: depois,
      },
    });
    paginas.push(...(res.data ?? []));
    depois = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!depois) break;
  }
  return paginas;
}

export async function subscribePageToLeadgen(pageId: string, pageAccessToken: string) {
  return request(`/${pageId}/subscribed_apps`, {
    method: "POST",
    query: { access_token: pageAccessToken, subscribed_fields: "leadgen" },
  });
}

export async function unsubscribePageFromLeadgen(pageId: string, pageAccessToken: string) {
  return request(`/${pageId}/subscribed_apps`, {
    method: "DELETE",
    query: { access_token: pageAccessToken },
  });
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status?: string;
  questions?: Array<{ key: string; label: string; type: string }>;
}

export async function listPageLeadForms(pageId: string, pageAccessToken: string): Promise<MetaLeadForm[]> {
  const res = await request<{ data: MetaLeadForm[] }>(`/${pageId}/leadgen_forms`, {
    query: { access_token: pageAccessToken, fields: "id,name,status,questions", limit: "100" },
  });
  return res.data ?? [];
}

export interface MetaLead {
  id: string;
  created_time: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data: Array<{ name: string; values: string[] }>;
}

export async function fetchLead(leadgenId: string, pageAccessToken: string): Promise<MetaLead> {
  return request<MetaLead>(`/${leadgenId}`, {
    query: {
      access_token: pageAccessToken,
      fields: "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data",
    },
  });
}

export interface MetaAdAttribution {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
}

interface AdNode {
  id: string;
  name?: string;
  adset?: { id?: string; name?: string };
  campaign?: { id?: string; name?: string };
}

/**
 * Busca nome do anúncio, conjunto e campanha a partir do ad_id do lead.
 *
 * O lead traz só IDs numéricos ("52525417339565"), que não dizem nada pra quem
 * olha a ficha. Esta chamada resolve os nomes reais
 * ("[COALA][FORMULARIO][COSTA-DOURADA]"), que é o que permite saber qual
 * anúncio está trazendo cliente.
 *
 * Exige o escopo ads_read no token. Devolve null em qualquer falha — atribuição
 * é enriquecimento, nunca pode derrubar a ingestão do lead.
 */
export async function fetchAdAttribution(
  adId: string,
  accessToken: string,
): Promise<MetaAdAttribution | null> {
  try {
    const node = await request<AdNode>(`/${adId}`, {
      query: {
        access_token: accessToken,
        fields: "id,name,adset{id,name},campaign{id,name}",
      },
    });
    if (!node?.id) return null;
    return {
      ad_id: node.id,
      ad_name: node.name ?? null,
      adset_id: node.adset?.id ?? null,
      adset_name: node.adset?.name ?? null,
      campaign_id: node.campaign?.id ?? null,
      campaign_name: node.campaign?.name ?? null,
    };
  } catch (err) {
    // Devolver null mantém a ingestão do lead de pé — atribuição é enriquecimento,
    // não pode derrubar a entrada do lead. Mas engolir calado foi o que escondeu
    // a falta do escopo `ads_read` por semanas: a atribuição vinha vazia e nada
    // no sistema dizia por quê.
    console.warn(
      JSON.stringify({
        scope: "meta-graph",
        msg: "atribuicao_de_anuncio_falhou",
        ad_id: adId,
        erro: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

interface LeadListResponse {
  data?: MetaLead[];
  paging?: {
    cursors?: {
      after?: string;
    };
  };
}

export interface ListFormLeadsParams {
  formId: string;
  pageAccessToken: string;
  since?: string;
  until?: string;
  limit?: number;
}

export async function listFormLeads(params: ListFormLeadsParams): Promise<MetaLead[]> {
  const leads: MetaLead[] = [];
  const maxLeads = Math.max(1, Math.min(params.limit ?? 200, 500));
  let after: string | undefined;

  while (leads.length < maxLeads) {
    const res = await request<LeadListResponse>(`/${params.formId}/leads`, {
      query: {
        access_token: params.pageAccessToken,
        fields: "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data",
        limit: String(Math.min(100, maxLeads - leads.length)),
        since: params.since ? String(Math.floor(Date.parse(params.since) / 1000)) : undefined,
        until: params.until ? String(Math.floor(Date.parse(params.until) / 1000)) : undefined,
        after,
      },
    });

    const pageLeads = res.data ?? [];
    const filtered = pageLeads.filter((lead) => {
      const createdAt = Date.parse(lead.created_time);
      if (params.since && createdAt < Date.parse(params.since)) return false;
      if (params.until && createdAt > Date.parse(params.until)) return false;
      return true;
    });
    leads.push(...filtered);

    after = res.paging?.cursors?.after;
    if (!after || pageLeads.length === 0) break;
  }

  return leads.slice(0, maxLeads);
}

export interface ContaDeAnuncio {
  /** `act_123…` — o formato que a Graph exige nas chamadas. */
  id: string;
  name: string;
  currency: string | null;
  /** 1 = ativa. Outros valores: desativada, em análise, com pagamento pendente etc. */
  account_status: number | null;
}

/** Contas de anúncio a que o token tem acesso. Exige `ads_read`. */
export async function listarContasDeAnuncio(accessToken: string): Promise<ContaDeAnuncio[]> {
  const contas: ContaDeAnuncio[] = [];
  let depois: string | undefined;
  // Teto de páginas: uma agência pode ter dezenas de contas, mas nunca milhares.
  for (let pagina = 0; pagina < 10; pagina++) {
    const res = await request<{
      data?: Array<{ id: string; name?: string; currency?: string; account_status?: number }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/me/adaccounts", {
      query: {
        access_token: accessToken,
        fields: "id,name,currency,account_status",
        limit: "100",
        after: depois,
      },
    });
    for (const c of res.data ?? []) {
      contas.push({
        id: c.id,
        name: c.name ?? c.id,
        currency: c.currency ?? null,
        account_status: c.account_status ?? null,
      });
    }
    depois = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!depois) break;
  }
  return contas;
}

/**
 * Gasto diário por anúncio de uma conta, no intervalo `[desde, ate]`.
 *
 * `time_increment=1` devolve uma linha por anúncio por dia — o grão que a tabela
 * guarda. A Meta só devolve linhas com entrega: dia sem impressão não aparece, e
 * isso é correto (gasto zero não precisa de linha).
 */
export async function buscarGastoDiario(
  contaId: string,
  accessToken: string,
  janela: { desde: string; ate: string },
): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  let depois: string | undefined;
  for (let pagina = 0; pagina < 200; pagina++) {
    const res = await request<{
      data?: Record<string, unknown>[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${contaId.startsWith("act_") ? contaId : `act_${contaId}`}/insights`, {
      query: {
        access_token: accessToken,
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since: janela.desde, until: janela.ate }),
        fields:
          "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,account_currency",
        limit: "500",
        after: depois,
      },
    });
    linhas.push(...(res.data ?? []));
    depois = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!depois) break;
  }
  return linhas;
}
