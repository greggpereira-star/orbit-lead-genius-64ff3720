/**
 * Provedor WhatsApp Cloud API (Graph API).
 *
 * Fala HTTP com `graph.facebook.com`; o token vem de `wa_credentials`, decifrado
 * aqui e nunca devolvido nem registrado em log. Nada lança: devolve `{ ok, error }`.
 */

import { META_GRAPH_BASE } from "../../meta-graph.server";
import { decifrarToken } from "./cifra";
import { classificarErroMeta, type ErroMeta } from "./erros";
import type {
  AdminDb,
  CanalWhatsApp,
  ConsultaDb,
  ResultadoDeEnvio,
  WhatsAppProvider,
} from "../provider";

export interface ResultadoCloud extends ResultadoDeEnvio {
  erroMeta?: ErroMeta & { codigo: number | null; fbtraceId: string | null };
}

interface RespostaGraph {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    code?: number;
    fbtrace_id?: string;
    error_data?: { details?: string };
  };
}

async function tokenDoNumero(db: AdminDb, phoneNumberId: string): Promise<string | null> {
  const { data: num } = await (db.from("wa_phone_numbers") as ConsultaDb)
    .select("account_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  const accountId = (num as { account_id?: string } | null)?.account_id;
  if (!accountId) return null;

  const { data: cred } = await (db.from("wa_credentials") as ConsultaDb)
    .select("access_token_enc")
    .eq("account_id", accountId)
    .maybeSingle();
  const enc = (cred as { access_token_enc?: string } | null)?.access_token_enc;
  if (!enc) return null;
  return decifrarToken(enc);
}

async function postar(
  phoneNumberId: string,
  token: string,
  corpo: Record<string, unknown>,
): Promise<ResultadoCloud> {
  const controller = new AbortController();
  const prazo = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...corpo,
      }),
      signal: controller.signal,
    });
    const texto = await res.text();
    let j: RespostaGraph = {};
    try {
      j = texto ? (JSON.parse(texto) as RespostaGraph) : {};
    } catch {
      /* corpo não-JSON: segue com o status HTTP */
    }

    const id = j.messages?.[0]?.id ?? null;
    if (res.ok && id) return { ok: true, data: { messageId: id } };

    const codigo = typeof j.error?.code === "number" ? j.error.code : null;
    const cls = classificarErroMeta(codigo, res.status);
    // `fbtrace_id` é o que a Meta pede para investigar; o token nunca é logado.
    console.error(
      JSON.stringify({
        scope: "wa-cloud",
        msg: "envio_falhou",
        phone_number_id: phoneNumberId,
        http: res.status,
        code: codigo,
        classe: cls.classe,
        fbtrace_id: j.error?.fbtrace_id ?? null,
      }),
    );
    return {
      ok: false,
      error: `${cls.texto}${j.error?.message ? ` (${j.error.message})` : ""}`,
      erroMeta: { ...cls, codigo, fbtraceId: j.error?.fbtrace_id ?? null },
    };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: abortou ? "Timeout na API do WhatsApp." : e instanceof Error ? e.message : String(e),
      erroMeta: { ...classificarErroMeta(null, 599), codigo: null, fbtraceId: null },
    };
  } finally {
    clearTimeout(prazo);
  }
}

export function criarCloudProvider(db: AdminDb): WhatsAppProvider & {
  sendTemplate(
    canal: CanalWhatsApp,
    para: string,
    nome: string,
    idioma: string,
    componentes?: unknown[],
  ): Promise<ResultadoCloud>;
} {
  const comToken = async (
    canal: CanalWhatsApp,
    f: (token: string) => Promise<ResultadoCloud>,
  ): Promise<ResultadoCloud> => {
    let token: string | null;
    try {
      token = await tokenDoNumero(db, canal.referencia);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Falha ao ler o acesso do WhatsApp.",
      };
    }
    if (!token)
      return { ok: false, error: "Número do WhatsApp sem credencial. Reconecte a conta." };
    return f(token);
  };

  return {
    id: "cloud",
    estaConfigurado: () => Boolean(process.env.WA_TOKEN_KEY),
    sendText: (canal, para, texto) =>
      comToken(canal, (token) =>
        postar(canal.referencia, token, {
          to: para,
          type: "text",
          text: { body: texto, preview_url: false },
        }),
      ),
    sendTemplate: (canal, para, nome, idioma, componentes = []) =>
      comToken(canal, (token) =>
        postar(canal.referencia, token, {
          to: para,
          type: "template",
          template: { name: nome, language: { code: idioma }, components: componentes },
        }),
      ),
  };
}
