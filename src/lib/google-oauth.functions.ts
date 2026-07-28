/**
 * OAuth do Google Ads.
 *
 * Espelha o fluxo do Meta em `meta-oauth.functions.ts` de propósito: mesma
 * forma de `state` assinado, mesma separação entre o que o navegador vê e o
 * que só o servidor conhece.
 *
 * O que existia antes era `oauthService.getAuthUrl`, que montava a URL no
 * navegador e mandava o retorno para `/functions/v1/oauth-callback` — uma Edge
 * Function do Supabase que nunca foi implantada na VPS e responde 500. Ou
 * seja: o botão "Connect Google Ads" levava a lugar nenhum.
 *
 * `client_secret` e `developer-token` nunca saem daqui. O navegador recebe
 * apenas a URL de consentimento, que é pública por natureza.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_PUBLIC_ORIGIN = 'https://altleadflow.com.br';

/**
 * `adwords` é o escopo da API do Google Ads. Pedimos só ele: quanto menor o
 * consentimento, menos a tela assusta quem autoriza — e menos temos a perder
 * se o refresh token vazar.
 */
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/adwords'].join(' ');

/** Precisa estar cadastrada em "URIs de redirecionamento autorizados" no Google Cloud. */
export const GOOGLE_REDIRECT_PATH = '/google-oauth-callback';

/**
 * Versões da API do Google Ads, da preferida para as alternativas.
 *
 * O Google aposenta versão a cada poucos meses, e uma versão morta responde
 * 404 — sem dizer que morreu. Foi assim que a primeira tentativa falhou: o
 * código pedia `v18`, que já tinha sido descontinuada, e o card mostrava
 * "HTTP 404" sem nenhuma pista do motivo.
 *
 * Em vez de cravar um número que vai expirar de novo, tentamos em ordem e
 * seguimos para a próxima quando o Google devolve 404. Qualquer outra resposta
 * — inclusive erro — significa que a versão existe e o problema é outro, então
 * ela é devolvida como está.
 *
 * `GOOGLE_ADS_API_VERSION` no ambiente força uma versão específica sem
 * recompilar, para o dia em que uma delas mudar de comportamento.
 */
const VERSOES_ADS_CONHECIDAS = ['v21', 'v22', 'v23', 'v24', 'v20'];

function versoesAds(): string[] {
  const preferida = readEnv('GOOGLE_ADS_API_VERSION');
  if (!preferida) return VERSOES_ADS_CONHECIDAS;
  return [preferida, ...VERSOES_ADS_CONHECIDAS.filter((v) => v !== preferida)];
}

/** Chama a API do Google Ads pulando versões descontinuadas. */
async function chamarAdsApi(
  caminho: string,
  accessToken: string,
  devToken: string,
  opcoes?: {
    body?: unknown;
    /**
     * Conta gerenciadora pela qual o acesso está sendo feito. O Google exige
     * este cabeçalho quando se consulta uma conta-filha através da MCC —
     * sem ele a resposta é `USER_PERMISSION_DENIED`, que parece falta de
     * permissão quando na verdade é falta de contexto.
     */
    loginCustomerId?: string;
  },
): Promise<{ res: Response; versao: string } | { erro: string }> {
  for (const versao of versoesAds()) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
    };
    if (opcoes?.loginCustomerId) headers['login-customer-id'] = opcoes.loginCustomerId;
    if (opcoes?.body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetch(`https://googleads.googleapis.com/${versao}/${caminho}`, {
      method: opcoes?.body !== undefined ? 'POST' : 'GET',
      headers,
      body: opcoes?.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
    if (res.status === 404) continue;
    return { res, versao };
  }
  return {
    erro:
      `Nenhuma das versões testadas da API do Google Ads respondeu ` +
      `(${versoesAds().join(', ')}). Provavelmente todas foram descontinuadas — ` +
      `defina GOOGLE_ADS_API_VERSION no servidor com uma versão atual.`,
  };
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  return value || undefined;
}

function getPublicUrl(): string {
  return (readEnv('PUBLIC_APP_URL') ?? DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
}

function redirectUri(): string {
  return `${getPublicUrl()}${GOOGLE_REDIRECT_PATH}`;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * O `state` carrega a empresa e vai assinado.
 *
 * Sem assinatura, bastaria alterar o parâmetro no meio do caminho para
 * conectar a conta de anúncios de alguém ao Google Ads de outro assinante.
 * O carimbo de tempo limita a janela em que um `state` capturado ainda serve.
 */
async function signState(companyId: string): Promise<string> {
  const secret = readEnv('GOOGLE_OAUTH_STATE_SECRET');
  if (!secret) throw new Error('GOOGLE_OAUTH_STATE_SECRET ausente no servidor.');
  const payload = JSON.stringify({ companyId, ts: Date.now() });
  const sig = await hmacHex(secret, payload);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

async function verifyState(state: string): Promise<{ companyId: string }> {
  const secret = readEnv('GOOGLE_OAUTH_STATE_SECRET');
  if (!secret) throw new Error('GOOGLE_OAUTH_STATE_SECRET ausente no servidor.');

  const decoded = Buffer.from(state, 'base64url').toString('utf8');
  const corte = decoded.lastIndexOf('.');
  if (corte < 0) throw new Error('State malformado.');

  const payload = decoded.slice(0, corte);
  const sig = decoded.slice(corte + 1);
  if ((await hmacHex(secret, payload)) !== sig) throw new Error('Assinatura de state inválida.');

  const dados = JSON.parse(payload) as { companyId?: string; ts?: number };
  if (!dados.companyId) throw new Error('State sem empresa.');
  if (!dados.ts || Date.now() - dados.ts > 15 * 60_000) {
    throw new Error('Autorização expirou. Comece de novo.');
  }
  return { companyId: dados.companyId };
}

/** Monta a URL de consentimento. O navegador só recebe isto. */
export const getGoogleAdsAuthUrl = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const clientId = readEnv('GOOGLE_CLIENT_ID');
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID não configurado no servidor.');

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES);
    // `offline` + `consent` são o que garantem o refresh_token. Sem os dois, o
    // Google devolve refresh token só na primeira autorização da vida daquele
    // usuário — e numa reconexão vem sem, deixando a integração morta em uma
    // hora, quando o access token expira.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', await signState(data.companyId));

    return { url: url.toString(), redirectUri: redirectUri() };
  });

/** Troca o `code` pelo refresh token e guarda no servidor. */
export const exchangeGoogleAdsCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const clientId = readEnv('GOOGLE_CLIENT_ID');
    const clientSecret = readEnv('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Credenciais Google ausentes no servidor.');

    const { companyId } = await verifyState(data.state);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: data.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    const corpo = (await res.json().catch(() => ({}))) as {
      refresh_token?: string;
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !corpo.refresh_token) {
      // `error_description` do Google costuma ser específico ("redirect_uri
      // mismatch", "invalid_client") — repassar ajuda a resolver sem adivinhar.
      const detalhe = corpo.error_description ?? corpo.error ?? `HTTP ${res.status}`;
      throw new Error(
        corpo.refresh_token === undefined && res.ok
          ? 'O Google não devolveu refresh token. Remova o acesso do app na conta Google e autorize de novo.'
          : `Falha ao trocar o código: ${detalhe}`,
      );
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: atual } = await supabaseAdmin
      .from('integrations')
      .select('config')
      .eq('company_id', companyId)
      .eq('provider', 'google_ads')
      .maybeSingle();

    // Preserva o que a tela de pixel já gravou (conversion_id e rótulos): a
    // conexão OAuth e a configuração de conversão convivem na mesma linha.
    const config = {
      ...(((atual?.config as Record<string, unknown>) ?? {}) as Record<string, unknown>),
      refresh_token: corpo.refresh_token,
      connected_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('integrations')
      .upsert(
        { company_id: companyId, provider: 'google_ads', config, status: 'connected' } as never,
        { onConflict: 'company_id,provider' },
      );
    if (error) throw new Error(`Não foi possível guardar a conexão: ${error.message}`);

    return { ok: true as const, companyId };
  });

/** Se esta empresa já autorizou, e quando. Nunca devolve o refresh token. */
export const getGoogleAdsStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: linha } = await supabaseAdmin
      .from('integrations')
      .select('config, status')
      .eq('company_id', data.companyId)
      .eq('provider', 'google_ads')
      .maybeSingle();

    const config = (linha?.config ?? {}) as { refresh_token?: string; connected_at?: string };
    return {
      conectado: !!config.refresh_token,
      conectadoEm: config.connected_at ?? null,
      redirectUri: redirectUri(),
    };
  });

/**
 * Access token de curta duração a partir do refresh token guardado.
 * Não é exposto como server function: só o servidor chama, nunca a tela.
 */
async function getAccessToken(companyId: string): Promise<string> {
  const clientId = readEnv('GOOGLE_CLIENT_ID');
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Credenciais Google ausentes no servidor.');

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('integrations')
    .select('config')
    .eq('company_id', companyId)
    .eq('provider', 'google_ads')
    .maybeSingle();

  const refresh = (data?.config as { refresh_token?: string } | null)?.refresh_token;
  if (!refresh) throw new Error('Google Ads não conectado nesta empresa.');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const corpo = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !corpo.access_token) {
    throw new Error(`Não foi possível renovar o acesso: ${corpo.error_description ?? res.status}`);
  }
  return corpo.access_token;
}

/**
 * Contas de anúncio que este login enxerga.
 *
 * Esta é também a primeira chamada real à API do Google Ads, e é ela que
 * revela o nível de acesso do developer token: um token ainda em "Test
 * Account" responde `DEVELOPER_TOKEN_NOT_APPROVED` ao tocar numa conta de
 * produção. Melhor descobrir isso aqui, num clique de teste, do que depois —
 * com conversões sendo silenciosamente recusadas.
 */
export const listGoogleAdsAccounts = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const devToken = readEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor.');

    const accessToken = await getAccessToken(data.companyId);

    const chamada = await chamarAdsApi('customers:listAccessibleCustomers', accessToken, devToken);
    if ('erro' in chamada) {
      return { ok: false as const, httpStatus: 404, erro: chamada.erro, detalhe: '' };
    }

    const { res, versao } = chamada;
    const corpo = (await res.json().catch(() => ({}))) as {
      resourceNames?: string[];
      error?: { message?: string; status?: string; details?: unknown };
    };

    if (!res.ok) {
      const msg = corpo.error?.message ?? `HTTP ${res.status}`;
      return {
        ok: false as const,
        httpStatus: res.status,
        erro: msg,
        // O texto do Google é a informação útil aqui: distingue "token não
        // aprovado" de "conta sem permissão" de "escopo faltando".
        detalhe: JSON.stringify(corpo.error ?? {}).slice(0, 600),
      };
    }

    // `customers/1234567890` → `1234567890`
    const ids = (corpo.resourceNames ?? []).map((r) => r.split('/').pop() ?? r);

    // Um ID de dez dígitos não diz nada a quem vai escolher a conta. Cada uma
    // é consultada para virar nome, e para sabermos se é gerenciadora — uma
    // MCC não tem conversões próprias, só contas-filhas.
    const contas = await Promise.all(
      ids.map(async (id) => {
        const detalhe = await consultarGaql(
          id,
          'SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code FROM customer LIMIT 1',
          accessToken,
          devToken,
        );
        const c = detalhe.linhas?.[0]?.customer as
          | { descriptiveName?: string; manager?: boolean; currencyCode?: string }
          | undefined;
        return {
          id,
          nome: c?.descriptiveName ?? `Conta ${id}`,
          ehGerenciadora: c?.manager === true,
          moeda: c?.currencyCode ?? null,
          // Conta que não respondeu não vira erro da tela inteira: aparece na
          // lista com o motivo, para não sumir em silêncio.
          erro: detalhe.erro ?? null,
        };
      }),
    );

    return { ok: true as const, contas, versao };
  });

/**
 * Ações de conversão de uma conta, já traduzidas para o que a tela de pixel
 * precisa.
 *
 * O pulo do gato é `tag_snippets`: o Google devolve ali o próprio trecho de
 * gtag que ele mandaria colar no site, e dentro dele está o
 * `send_to: 'AW-123/rótulo'`. É de onde saem o ID de conversão e o rótulo sem
 * ninguém precisar copiar do painel — que é justamente onde se erra um
 * caractere e a conversão nunca aparece.
 */
export const listGoogleAdsConversionActions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        customerId: z.string().min(1),
        loginCustomerId: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const devToken = readEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor.');
    const accessToken = await getAccessToken(data.companyId);

    const r = await consultarGaql(
      data.customerId,
      `SELECT conversion_action.id,
              conversion_action.name,
              conversion_action.type,
              conversion_action.category,
              conversion_action.status,
              conversion_action.tag_snippets
         FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'`,
      accessToken,
      devToken,
      data.loginCustomerId,
    );
    if (r.erro) return { ok: false as const, erro: r.erro };

    const acoes = (r.linhas ?? []).map((linha) => {
      const ca = (linha.conversionAction ?? {}) as {
        id?: string;
        name?: string;
        type?: string;
        category?: string;
        tagSnippets?: Array<{ eventSnippet?: string; globalSiteTag?: string }>;
      };
      const snippets = (ca.tagSnippets ?? [])
        .map((s) => s.eventSnippet ?? '')
        .join('\n');
      // `send_to: 'AW-123456789/AbCdEf-gh12'`
      const casado = snippets.match(/['"](AW-\d+)\/([\w-]+)['"]/);
      return {
        id: ca.id ?? '',
        nome: ca.name ?? '(sem nome)',
        tipo: ca.type ?? null,
        categoria: ca.category ?? null,
        conversionId: casado?.[1] ?? null,
        rotulo: casado?.[2] ?? null,
      };
    });

    return { ok: true as const, acoes };
  });

/** Executa uma consulta GAQL numa conta e devolve as linhas cruas. */
async function consultarGaql(
  customerId: string,
  query: string,
  accessToken: string,
  devToken: string,
  loginCustomerId?: string,
): Promise<{ linhas?: Record<string, unknown>[]; erro?: string }> {
  const chamada = await chamarAdsApi(
    `customers/${customerId}/googleAds:search`,
    accessToken,
    devToken,
    // Só `query`, sem `pageSize`. Mandar os dois com um `LIMIT` na própria
    // consulta faz o Google recusar com "Request contains an invalid
    // argument" — mensagem que não diz qual argumento, e custou uma sessão
    // inteira de depuração. O limite mora na GAQL.
    { body: { query }, loginCustomerId },
  );
  if ('erro' in chamada) return { erro: chamada.erro };

  const corpo = (await chamada.res.json().catch(() => ({}))) as {
    results?: Record<string, unknown>[];
    error?: {
      message?: string;
      details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }>;
    };
  };
  if (!chamada.res.ok) {
    return { erro: extrairErroGoogle(corpo.error, chamada.res.status) };
  }
  return { linhas: corpo.results ?? [] };
}

/**
 * O `message` de topo do Google é quase sempre genérico ("Request contains an
 * invalid argument"). O que serve para agir está em `details[].errors[]`, com
 * o código do erro. Puxar isso à tona é a diferença entre um bug de dez
 * minutos e um de uma hora.
 */
function extrairErroGoogle(
  erro: { message?: string; details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }> } | undefined,
  status: number,
): string {
  const interno = erro?.details?.[0]?.errors?.[0];
  if (interno?.message) {
    const codigo = interno.errorCode ? Object.values(interno.errorCode)[0] : undefined;
    return codigo ? `${interno.message} (${codigo})` : interno.message;
  }
  return erro?.message ?? `HTTP ${status}`;
}
