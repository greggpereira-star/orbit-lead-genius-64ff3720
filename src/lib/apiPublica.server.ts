/**
 * Autenticação e respostas da API pública (`/api/public/v1/*`).
 *
 * Ordem das conferências, e por quê:
 *   1. chave válida   — sem isto nada mais é consultado; todas as falhas de chave
 *                       dão a MESMA resposta (ausente, torta, desconhecida,
 *                       revogada, vencida), para ninguém sondar quais existem.
 *   2. limite de taxa — antes do plano, para uma chave em loop não martelar o banco.
 *   3. plano          — `api_publica`; o plano pode mudar depois da chave criada.
 *   4. escopo         — o que ESTA chave pode fazer.
 *
 * Falha de infraestrutura NEGA (503), nunca libera: erro de banco não vira acesso.
 * Sem CORS de propósito: a API é de servidor para servidor, e uma chave dentro de
 * uma página pública estaria à vista de qualquer visitante.
 */
import { chaveDoCabecalho, hashDaChave } from "./apiPublica/chaves.server";
import { permite, type Escopo } from "./apiPublica/escopos";
import { temRecurso } from "./planos.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export const LIMITE_POR_MINUTO = 120;
const VALIDADE_DO_PLANO_EM_CACHE_MS = 30_000;

export interface ContextoDaApi {
  companyId: string;
  keyId: string;
  keyNome: string;
  escopos: string[];
}

export type ResultadoDeAutenticacao =
  { ok: true; ctx: ContextoDaApi } | { ok: false; resposta: Response };

const CABECALHOS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function resposta(
  corpo: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CABECALHOS, ...extra } });
}

export function erroDaApi(
  status: number,
  code: string,
  message: string,
  extra: Record<string, string> = {},
): Response {
  return resposta({ error: { code, message } }, status, extra);
}

/**
 * Método que a rota não implementa. Sem handler, o TanStack entrega a página HTML
 * do app com 200 — e um cliente de API que mandou DELETE concluiria que apagou.
 */
export function metodoNaoPermitido(permitidos: string): Response {
  return erroDaApi(405, "method_not_allowed", `Método não suportado. Use: ${permitidos}.`, {
    allow: permitidos,
  });
}

/** Segundos até virar o minuto: quando o contador do limite zera. */
export function segundosAteFimDaJanela(agoraMs: number): number {
  return Math.max(1, 60 - Math.floor((agoraMs % 60_000) / 1000));
}

const cachePlano = new Map<string, { valor: boolean; ate: number }>();

async function planoLibera(admin: Admin, companyId: string): Promise<boolean> {
  const agora = Date.now();
  const guardado = cachePlano.get(companyId);
  if (guardado && guardado.ate > agora) return guardado.valor;
  const valor = await temRecurso(admin, companyId, "api_publica");
  cachePlano.set(companyId, { valor, ate: agora + VALIDADE_DO_PLANO_EM_CACHE_MS });
  return valor;
}

/** Só para teste. */
export function limparCacheDePlano(): void {
  cachePlano.clear();
}

export async function autenticarApi(
  request: Request,
  admin: Admin,
  escopo: Escopo,
): Promise<ResultadoDeAutenticacao> {
  const chave = chaveDoCabecalho(request.headers.get("authorization"));
  if (!chave) {
    return {
      ok: false,
      resposta: erroDaApi(
        401,
        "invalid_api_key",
        "Chave de API ausente ou inválida. Envie Authorization: Bearer <chave>.",
        {
          "www-authenticate": 'Bearer realm="leadflow-api"',
        },
      ),
    };
  }

  const { data: linha, error } = await admin
    .from("api_keys")
    .select("id, company_id, nome, escopos, expira_em, revogada_em")
    .eq("hash", hashDaChave(chave))
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      resposta: erroDaApi(503, "unavailable", "Serviço indisponível. Tente novamente."),
    };
  }
  const vencida = linha?.expira_em && Date.parse(linha.expira_em) <= Date.now();
  if (!linha || linha.revogada_em || vencida) {
    return {
      ok: false,
      resposta: erroDaApi(
        401,
        "invalid_api_key",
        "Chave de API ausente ou inválida. Envie Authorization: Bearer <chave>.",
        {
          "www-authenticate": 'Bearer realm="leadflow-api"',
        },
      ),
    };
  }

  const { data: contagem, error: erroLimite } = await admin.rpc("api_consumir_limite", {
    p_key_id: linha.id,
  });
  if (erroLimite || typeof contagem !== "number") {
    return {
      ok: false,
      resposta: erroDaApi(503, "unavailable", "Serviço indisponível. Tente novamente."),
    };
  }
  if (contagem > LIMITE_POR_MINUTO) {
    const espera = String(segundosAteFimDaJanela(Date.now()));
    return {
      ok: false,
      resposta: erroDaApi(
        429,
        "rate_limited",
        `Limite de ${LIMITE_POR_MINUTO} requisições por minuto excedido.`,
        {
          "retry-after": espera,
          "x-ratelimit-limit": String(LIMITE_POR_MINUTO),
          "x-ratelimit-remaining": "0",
        },
      ),
    };
  }

  if (!(await planoLibera(admin, linha.company_id))) {
    return {
      ok: false,
      resposta: erroDaApi(
        403,
        "feature_not_available",
        "A API pública não está incluída no plano desta empresa.",
      ),
    };
  }

  const escopos: string[] = Array.isArray(linha.escopos) ? linha.escopos : [];
  if (!permite(escopos, escopo)) {
    return {
      ok: false,
      resposta: erroDaApi(403, "insufficient_scope", `Esta chave não tem o escopo ${escopo}.`),
    };
  }

  // Marca o uso no máximo uma vez por minuto; falhar aqui não pode derrubar a requisição.
  const limiar = new Date(Date.now() - 60_000).toISOString();
  void Promise.resolve(
    admin
      .from("api_keys")
      .update({ ultimo_uso_em: new Date().toISOString() })
      .eq("id", linha.id)
      .or(`ultimo_uso_em.is.null,ultimo_uso_em.lt.${limiar}`),
  ).catch(() => {});

  return {
    ok: true,
    ctx: { companyId: linha.company_id, keyId: linha.id, keyNome: linha.nome, escopos },
  };
}

/**
 * Lê o corpo JSON com teto de tamanho, EM FLUXO: para de ler e cancela no instante
 * em que passa do limite. Conferir só depois de `request.text()` deixaria um corpo
 * em partes (sem Content-Length) ocupar memória inteiro antes de ser recusado.
 */
export async function lerJson(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<{ ok: true; valor: unknown } | { ok: false; resposta: Response }> {
  const grande = () => ({
    ok: false as const,
    resposta: erroDaApi(413, "payload_too_large", "Corpo grande demais."),
  });
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (declarado > maxBytes) return grande();

  const leitor = request.body?.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  if (leitor) {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await leitor.cancel().catch(() => {});
        return grande();
      }
      partes.push(value);
    }
  }
  try {
    return { ok: true, valor: JSON.parse(Buffer.concat(partes).toString("utf8")) };
  } catch {
    return { ok: false, resposta: erroDaApi(400, "invalid_json", "O corpo não é um JSON válido.") };
  }
}
