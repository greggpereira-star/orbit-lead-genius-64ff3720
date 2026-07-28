/**
 * Chamadas à API do Google Ads. Só servidor.
 *
 * Separado de `google-oauth.functions.ts` porque aquele arquivo é importado
 * pela tela — o TanStack Start remove os handlers das server functions do
 * bundle do navegador, mas qualquer função solta exportada dali iria junto.
 * Aqui não entra nada que o navegador possa ver: refresh token, client secret
 * e developer token vivem só neste lado.
 */

const VERSOES_ADS_CONHECIDAS = ['v21', 'v22', 'v23', 'v24', 'v20'];

export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  return value || undefined;
}

function versoesAds(): string[] {
  const preferida = readEnv('GOOGLE_ADS_API_VERSION');
  if (!preferida) return VERSOES_ADS_CONHECIDAS;
  return [preferida, ...VERSOES_ADS_CONHECIDAS.filter((v) => v !== preferida)];
}

/**
 * Chama a API pulando versões descontinuadas.
 *
 * O Google aposenta versão a cada poucos meses e uma versão morta responde
 * 404 seco, sem dizer que morreu — foi assim que a primeira integração falhou,
 * pedindo `v18`. Qualquer resposta que não seja 404 significa que a versão
 * existe e o problema é outro, então volta como está.
 */
export async function chamarAdsApi(
  caminho: string,
  accessToken: string,
  devToken: string,
  opcoes?: { body?: unknown; loginCustomerId?: string },
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
      `Nenhuma versão testada da API do Google Ads respondeu (${versoesAds().join(', ')}). ` +
      `Defina GOOGLE_ADS_API_VERSION no servidor com uma versão atual.`,
  };
}

/**
 * O `message` de topo do Google é quase sempre genérico ("Request contains an
 * invalid argument"). O que serve para agir mora em `details[].errors[]`.
 */
export function extrairErroGoogle(
  erro:
    | {
        message?: string;
        details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }>;
      }
    | undefined,
  status: number,
): string {
  const interno = erro?.details?.[0]?.errors?.[0];
  if (interno?.message) {
    const codigo = interno.errorCode ? Object.values(interno.errorCode)[0] : undefined;
    return codigo ? `${interno.message} (${codigo})` : interno.message;
  }
  return erro?.message ?? `HTTP ${status}`;
}

/** Access token de curta duração a partir do refresh token guardado. */
export async function getGoogleAccessToken(companyId: string): Promise<string> {
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

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const corpo = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!res.ok || !corpo.access_token) {
    throw new Error(`Não foi possível renovar o acesso: ${corpo.error_description ?? res.status}`);
  }
  return corpo.access_token;
}

export interface ConfigConversaoGoogle {
  customer_id?: string;
  login_customer_id?: string;
  /** `customers/123/conversionActions/456` — o que a API entende. */
  lead_conversion_action?: string;
  sale_conversion_action?: string;
}

export async function getConfigGoogleAds(companyId: string): Promise<ConfigConversaoGoogle | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('integrations')
    .select('config, status')
    .eq('company_id', companyId)
    .eq('provider', 'google_ads')
    .maybeSingle();
  if (!data) return null;
  return (data.config ?? {}) as ConfigConversaoGoogle;
}

async function sha256Hex(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Formato que o Google exige: `yyyy-MM-dd HH:mm:ss+HH:mm`.
 *
 * O fuso é obrigatório. Sem ele a conversão é recusada — e o erro fala de
 * formato inválido sem dizer que o que falta é o deslocamento.
 */
function dataHoraGoogle(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
  );
}

export interface EnvioConversao {
  companyId: string;
  /** 'lead' quando o contato é capturado; 'sale' quando o lead vira cliente. */
  tipo: 'lead' | 'sale';
  /** Identificador do lead. Vira `orderId` — é o que evita contar duas vezes. */
  leadId: string;
  gclid?: string | null;
  email?: string | null;
  phone?: string | null;
  quando?: Date;
  valor?: number | null;
  moeda?: string | null;
}

export interface ResultadoConversao {
  status: 'enviada' | 'sem_configuracao' | 'sem_identificador' | 'falhou';
  detalhe?: string;
}

/**
 * Envia uma conversão offline ao Google Ads.
 *
 * Duas formas de atribuir, nesta ordem de preferência:
 *   `gclid` — o identificador do clique no anúncio. É a atribuição exata.
 *   contato com hash — "conversões otimizadas para leads". Serve para quem
 *   chegou sem gclid ou perdeu o parâmetro no caminho, com correspondência
 *   probabilística.
 *
 * Mandamos os dois quando existem: o Google usa o gclid e o contato reforça a
 * correspondência.
 */
export async function enviarConversaoGoogle(envio: EnvioConversao): Promise<ResultadoConversao> {
  const devToken = readEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!devToken) return { status: 'sem_configuracao', detalhe: 'developer token ausente' };

  const config = await getConfigGoogleAds(envio.companyId);
  const acao = envio.tipo === 'lead' ? config?.lead_conversion_action : config?.sale_conversion_action;
  if (!config?.customer_id || !acao) {
    return { status: 'sem_configuracao', detalhe: `conversão de ${envio.tipo} não escolhida` };
  }

  const identificadores: Array<Record<string, unknown>> = [];
  if (envio.email?.trim()) identificadores.push({ hashedEmail: await sha256Hex(envio.email) });
  if (envio.phone?.trim()) {
    const digitos = envio.phone.replace(/\D+/g, '');
    // E.164 sem o `+`. Número brasileiro sem país não casa com ninguém.
    const e164 = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
    if (e164) identificadores.push({ hashedPhoneNumber: await sha256Hex(e164) });
  }

  if (!envio.gclid && identificadores.length === 0) {
    return { status: 'sem_identificador', detalhe: 'lead sem gclid e sem contato' };
  }

  const conversao: Record<string, unknown> = {
    conversionAction: acao,
    conversionDateTime: dataHoraGoogle(envio.quando ?? new Date()),
    // O mesmo lead nunca conta duas vezes, nem se o envio for repetido.
    orderId: `${envio.tipo}-${envio.leadId}`,
  };
  if (envio.gclid) conversao.gclid = envio.gclid;
  if (identificadores.length) conversao.userIdentifiers = identificadores;
  if (envio.tipo === 'sale' && envio.valor != null) {
    conversao.conversionValue = envio.valor;
    conversao.currencyCode = envio.moeda ?? 'BRL';
  }

  try {
    const accessToken = await getGoogleAccessToken(envio.companyId);
    const chamada = await chamarAdsApi(
      `customers/${config.customer_id}:uploadClickConversions`,
      accessToken,
      devToken,
      {
        // `partialFailure` para uma linha ruim não derrubar o lote inteiro.
        body: { conversions: [conversao], partialFailure: true },
        loginCustomerId: config.login_customer_id,
      },
    );
    if ('erro' in chamada) return { status: 'falhou', detalhe: chamada.erro };

    const corpo = (await chamada.res.json().catch(() => ({}))) as {
      partialFailureError?: { message?: string };
      error?: Parameters<typeof extrairErroGoogle>[0];
      results?: unknown[];
    };

    if (!chamada.res.ok) {
      return { status: 'falhou', detalhe: extrairErroGoogle(corpo.error, chamada.res.status) };
    }
    // Com `partialFailure`, o Google devolve 200 e coloca a recusa aqui. Sem
    // olhar este campo, uma conversão rejeitada passaria por sucesso.
    if (corpo.partialFailureError?.message) {
      return { status: 'falhou', detalhe: corpo.partialFailureError.message };
    }
    return { status: 'enviada' };
  } catch (err) {
    return { status: 'falhou', detalhe: err instanceof Error ? err.message : String(err) };
  }
}
