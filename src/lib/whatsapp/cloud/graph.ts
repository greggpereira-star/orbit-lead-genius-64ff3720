/**
 * Chamadas da Graph API específicas do WhatsApp Business.
 *
 * Nada lança: devolve `{ ok, data }` ou `{ ok: false, erro }` com a classe do
 * erro. O token entra como argumento e NUNCA aparece em log nem no retorno.
 *
 * Pontos marcados [VERIFICAR] foram escritos a partir da documentação de
 * referência e não foram exercitados contra a Meta (não há credencial de
 * homologação neste ambiente).
 */

import { META_GRAPH_BASE } from "../../meta-graph.server";
import { classificarErroMeta, type ErroMeta } from "./erros";

export type RespostaGraph<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      erro: ErroMeta & {
        codigo: number | null;
        mensagem: string;
        fbtraceId: string | null;
        http: number;
      };
    };

interface Init {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function chamar<T>(caminho: string, init: Init = {}): Promise<RespostaGraph<T>> {
  const url = new URL(`${META_GRAPH_BASE}${caminho.startsWith("/") ? caminho : `/${caminho}`}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v != null) url.searchParams.set(k, v);

  const controller = new AbortController();
  const prazo = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers: {
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const texto = await res.text();
    let j: Record<string, unknown> = {};
    try {
      j = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      /* corpo não-JSON */
    }
    const e = (j.error ?? null) as { message?: string; code?: number; fbtrace_id?: string } | null;
    if (res.ok && !e) return { ok: true, data: j as T };

    const codigo = typeof e?.code === "number" ? e.code : null;
    return {
      ok: false,
      erro: {
        ...classificarErroMeta(codigo, res.status),
        codigo,
        mensagem: e?.message ?? `HTTP ${res.status}`,
        fbtraceId: e?.fbtrace_id ?? null,
        http: res.status,
      },
    };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      erro: {
        ...classificarErroMeta(null, 599),
        codigo: null,
        mensagem: abortou
          ? "Timeout na Graph API"
          : err instanceof Error
            ? err.message
            : String(err),
        fbtraceId: null,
        http: 0,
      },
    };
  } finally {
    clearTimeout(prazo);
  }
}

/** Código do Embedded Signup → token de acesso da empresa. [VERIFICAR] redirect_uri */
export function trocarCodigoPorToken(p: { appId: string; appSecret: string; code: string }) {
  return chamar<{ access_token: string; token_type?: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      query: { client_id: p.appId, client_secret: p.appSecret, code: p.code },
    },
  );
}

/**
 * Sem esta inscrição o número "conecta" e nenhum webhook chega.
 *
 * O app da Meta pode ter, no nível do APP, um callback de WhatsApp que serve
 * outro sistema. Por isso a inscrição leva `override_callback_uri`: só ESTA
 * conta (WABA) passa a entregar aqui, e o callback do app fica como está.
 */
export function inscreverAppNaWaba(
  wabaId: string,
  token: string,
  destino?: { url: string; verifyToken: string },
) {
  return chamar<{ success?: boolean }>(`/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    token,
    ...(destino
      ? { body: { override_callback_uri: destino.url, verify_token: destino.verifyToken } }
      : {}),
  });
}

export interface DadosDoNumero {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
  code_verification_status?: string;
}

const CAMPOS_COMPLETOS =
  "display_phone_number,verified_name,quality_rating,messaging_limit_tier,platform_type,is_on_biz_app,code_verification_status";
const CAMPOS_MINIMOS = "display_phone_number,verified_name,quality_rating";

/**
 * Um campo inexistente derruba a consulta inteira (erro 100). Por isso a
 * segunda tentativa com o conjunto mínimo: perder `is_on_biz_app` é melhor do
 * que não conseguir conectar. [VERIFICAR] nomes de campo contra a versão da API.
 */
export async function lerNumero(
  phoneNumberId: string,
  token: string,
): Promise<RespostaGraph<DadosDoNumero>> {
  const caminho = `/${encodeURIComponent(phoneNumberId)}`;
  const cheio = await chamar<DadosDoNumero>(caminho, {
    token,
    query: { fields: CAMPOS_COMPLETOS },
  });
  if (cheio.ok || cheio.erro.codigo !== 100) return cheio;
  return chamar<DadosDoNumero>(caminho, { token, query: { fields: CAMPOS_MINIMOS } });
}

export interface TemplateDaMeta {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: unknown[];
  rejected_reason?: string;
  quality_score?: { score?: string };
}

export async function listarTemplatesDaWaba(
  wabaId: string,
  token: string,
): Promise<RespostaGraph<TemplateDaMeta[]>> {
  const todos: TemplateDaMeta[] = [];
  let proxima: string | null = null;
  // Teto de páginas: resposta com `paging.next` cíclico não pode prender o servidor.
  for (let pagina = 0; pagina < 20; pagina++) {
    const r: RespostaGraph<{
      data?: TemplateDaMeta[];
      paging?: { cursors?: { after?: string }; next?: string };
    }> = await chamar(`/${encodeURIComponent(wabaId)}/message_templates`, {
      token,
      query: {
        fields: "id,name,language,category,status,components,rejected_reason,quality_score",
        limit: "100",
        after: proxima ?? undefined,
      },
    });
    if (!r.ok) return r;
    todos.push(...(r.data.data ?? []));
    proxima = r.data.paging?.next ? (r.data.paging.cursors?.after ?? null) : null;
    if (!proxima) break;
  }
  return { ok: true, data: todos };
}

export function criarTemplateNaMeta(
  wabaId: string,
  token: string,
  def: { name: string; language: string; category: string; components: unknown[] },
) {
  return chamar<{ id?: string; status?: string; category?: string }>(
    `/${encodeURIComponent(wabaId)}/message_templates`,
    { method: "POST", token, body: def },
  );
}

export function apagarTemplateNaMeta(wabaId: string, token: string, nome: string) {
  return chamar<{ success?: boolean }>(`/${encodeURIComponent(wabaId)}/message_templates`, {
    method: "DELETE",
    token,
    query: { name: nome },
  });
}

/** Coexistência: pede (uma única vez por número) o histórico ou os contatos do app. */
export function pedirSincronizacaoDoApp(
  phoneNumberId: string,
  token: string,
  tipo: "history" | "smb_app_state_sync",
) {
  return chamar<{ request_id?: string }>(`/${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
    method: "POST",
    token,
    body: { messaging_product: "whatsapp", sync_type: tipo },
  });
}

export interface MetadadosDaMidia {
  id?: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}

/**
 * Passo 1 do download de mídia recebida: devolve uma URL TEMPORÁRIA. Ela expira
 * em minutos — por isso o arquivo é baixado e guardado logo, e não servido da Meta.
 */
export function lerMetadadosDaMidia(mediaId: string, token: string) {
  return chamar<MetadadosDaMidia>(`/${encodeURIComponent(mediaId)}`, { token });
}
