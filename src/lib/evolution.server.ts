/**
 * Cliente da Evolution API (WhatsApp não-oficial, protocolo do WhatsApp Web).
 *
 * A instância já roda na própria VPS; aqui só falamos HTTP com ela. Toda função
 * devolve um resultado tipado em vez de lançar, porque os chamadores são
 * disparos "fire and forget" no fluxo de criação de lead — uma falha de
 * WhatsApp nunca pode derrubar a gravação do lead.
 */

const BASE_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";

export function isEvolutionConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

export function evolutionBaseUrl(): string {
  return BASE_URL;
}

/**
 * "Tem variável de ambiente" não é o mesmo que "a API responde".
 *
 * Confundir os dois fazia a tela dizer que estava tudo certo enquanto o
 * endereço configurado sequer respondia — o usuário só descobria ao clicar em
 * conectar e receber um erro cru. Este ping separa as duas coisas e devolve
 * uma causa legível.
 */
export async function pingEvolution(): Promise<{
  reachable: boolean;
  error?: string;
  version?: string;
}> {
  if (!isEvolutionConfigured()) {
    return {
      reachable: false,
      error: "EVOLUTION_API_URL / EVOLUTION_API_KEY não configuradas no servidor.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(`${BASE_URL}/`, {
      headers: { apikey: API_KEY },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { reachable: false, error: `A Evolution API respondeu ${res.status} em ${BASE_URL}.` };
    }
    const body = (await res.json().catch(() => null)) as { version?: string } | null;
    return { reachable: true, version: body?.version };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Causas comuns, traduzidas: certificado inválido, DNS, recusa de conexão.
    const friendly = /abort/i.test(raw)
      ? `Sem resposta de ${BASE_URL} (timeout).`
      : `Não foi possível alcançar ${BASE_URL} — ${raw}`;
    return { reachable: false, error: friendly };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EvolutionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Traduz o status para a causa provável.
 *
 * "Evolution 403" não diz a ninguém o que fazer. O status importa para quem lê
 * log; para quem está na tela, o que importa é se o problema é a chave, o
 * endereço, ou uma instância que não existe mais.
 */
function explicarStatus(status: number, detalhe = ""): string {
  if (status === 403 && /already in use/i.test(detalhe))
    return "A Evolution ainda está liberando a conexão anterior desta empresa.";
  if (status === 401) return "A Evolution recusou a chave de acesso (EVOLUTION_API_KEY).";
  if (status === 403)
    return "Alguma coisa entre o app e a Evolution bloqueou a chamada — confira se EVOLUTION_API_URL aponta para a Evolution e não para um proxy.";
  if (status === 404) return "A instância não existe mais na Evolution.";
  if (status === 502 || status === 503 || status === 504)
    return "A Evolution está fora do ar ou reiniciando.";
  return "A Evolution recusou a chamada.";
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<EvolutionResult<T>> {
  if (!isEvolutionConfigured()) {
    return {
      ok: false,
      error: "Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: API_KEY,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      /* A Evolution v2 devolve a causa em `response.message` (lista), e o
         `error` é só o nome do status ("Forbidden"). Ler `message` na raiz
         fazia todo 403 virar "Forbidden" puro — e foi assim que "nome já em
         uso" passou semanas parecendo um bloqueio de proxy. */
      const aninhada =
        parsed && typeof parsed === "object" ? (parsed as any).response?.message : undefined;
      const detail =
        parsed && typeof parsed === "object"
          ? ((Array.isArray(aninhada) ? aninhada.join("; ") : aninhada) ??
            (parsed as any).message ??
            (parsed as any).error ??
            JSON.stringify(parsed))
          : String(parsed ?? "");

      // Registrar a falha é o ponto todo desta mudança.
      //
      // Um "Evolution 403: Forbidden" apareceu na tela do usuário e não foi
      // possível descobrir de onde veio: o cliente não gravava nada, nem no
      // journal nem no last_error da instância. Sobrou reproduzir à mão cada
      // chamada — e nenhuma reproduziu, porque a Evolution devolve 200, 401 ou
      // 404, nunca 403. Sem registro, a única pista era uma captura de tela.
      //
      // Guarda o caminho e o status, nunca a apikey. `BASE_URL` entra porque a
      // hipótese mais difícil de descartar foi justamente estar apontando para
      // outro lugar que não a Evolution.
      console.error(
        JSON.stringify({
          scope: "evolution",
          msg: "chamada_falhou",
          method: init.method ?? "GET",
          path,
          base: BASE_URL,
          status: res.status,
          detail: String(detail).slice(0, 200),
        }),
      );

      return {
        ok: false,
        error: `${explicarStatus(res.status, String(detail))} (Evolution ${res.status}: ${String(detail).slice(0, 200)})`,
      };
    }

    return { ok: true, data: parsed as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message === "The operation was aborted." ? "Timeout na Evolution API." : message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

import { toWhatsAppNumber } from "./whatsapp/numero";

/** Reexportada por compatibilidade: a regra vive em `./whatsapp/numero`. */
export { toWhatsAppNumber };

export interface CreateInstanceResult {
  instanceName: string;
  qrCodeBase64: string | null;
  pairingCode: string | null;
}

/**
 * Cria a instância e já devolve o QR code pro usuário parear o aparelho.
 * A Evolution retorna o QR em formatos ligeiramente diferentes conforme a
 * versão, então normalizamos aqui.
 */
export async function createInstance(
  instanceName: string,
  webhookUrl?: string,
  /** DDI + DDD + número. Só com ele a Evolution gera o código de pareamento. */
  numero?: string,
): Promise<EvolutionResult<CreateInstanceResult>> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  /* O código de pareamento (a alternativa ao QR) só nasce se a instância for
     CRIADA com o número: criada sem ele, `connect?number=` devolve
     `pairingCode: null` mesmo com número válido (medido na VPS em 29/10/2026).
     Criada com ele, a resposta já traz o código e o QR junto. */
  if (numero) body.number = numero;

  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      // LABELS_ASSOCIATION é o caminho de volta do espelhamento: sem assinar,
      // etiquetar no aparelho nunca moveria o card, e o sintoma seria "não
      // funciona" sem nenhum erro em lugar nenhum.
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "LABELS_ASSOCIATION"],
    };
  }

  /* Logo depois de apagar a instância, a Evolution ainda segura o nome por
     alguns segundos e o `create` volta 403 "already in use" (reproduzido na VPS
     em 29/10/2026: criar, apagar e criar de novo = 403). Quem clica em
     "Conectar número" apaga a anterior antes de criar, então caía nisso quase
     sempre que já havia tentado antes. Espera e repete, só para esse caso. */
  let res = await call<any>("/instance/create", { method: "POST", body });
  for (
    let n = 1;
    n <= 6 && !res.ok && /ainda está liberando|already in use/i.test(res.error ?? "");
    n++
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await call<any>("/instance/create", { method: "POST", body });
  }
  if (!res.ok) return { ok: false, error: res.error };

  const d = res.data ?? {};
  const qr = d.qrcode ?? d.qrCode ?? {};
  return {
    ok: true,
    data: {
      instanceName,
      qrCodeBase64: qr.base64 ?? qr.code ?? null,
      pairingCode: qr.pairingCode ?? null,
    },
  };
}

/** Novo QR quando o anterior expira (a Evolution rotaciona a cada ~30s). */
export async function getQrCode(
  instanceName: string,
): Promise<EvolutionResult<{ qrCodeBase64: string | null }>> {
  const res = await call<any>(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const d = res.data ?? {};
  return { ok: true, data: { qrCodeBase64: d.base64 ?? d.code ?? null } };
}

export interface InstanceState {
  state: string;
  connected: boolean;
}

export async function getInstanceState(
  instanceName: string,
): Promise<EvolutionResult<InstanceState>> {
  const res = await call<any>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const state = res.data?.instance?.state ?? res.data?.state ?? "unknown";
  return { ok: true, data: { state, connected: state === "open" } };
}

export async function deleteInstance(instanceName: string): Promise<EvolutionResult<unknown>> {
  const logout = await call<unknown>(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
  const removed = await call<unknown>(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
  // Logout costuma falhar quando já estava desconectado; o que importa é o delete.
  return removed.ok ? removed : logout;
}

export interface SendTextResult {
  messageId: string | null;
}

export async function sendText(
  instanceName: string,
  toNumber: string,
  text: string,
): Promise<EvolutionResult<SendTextResult>> {
  const number = toWhatsAppNumber(toNumber);
  if (!number) return { ok: false, error: `Telefone inválido: ${toNumber}` };

  const res = await call<any>(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { number, text },
  });
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, data: { messageId: res.data?.key?.id ?? null } };
}

/**
 * Reassina os eventos de uma instância que JÁ existe.
 *
 * Instância criada antes de `LABELS_ASSOCIATION` entrar na lista continua sem
 * receber o evento, e o sintoma é "etiquetar não move o card" sem erro nenhum
 * em lugar algum. Reconectar resolveria, mas obriga a reler o QR — isto conserta
 * sem derrubar a sessão.
 *
 * A rota foi confirmada por sondagem: `/webhook/set/{instancia}` responde 404 de
 * INSTÂNCIA inexistente, enquanto uma rota inventada responde "Cannot POST".
 */
export async function reassinarEventos(
  instanceName: string,
  webhookUrl: string,
  events: string[],
): Promise<EvolutionResult<unknown>> {
  return call<unknown>(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events } },
  });
}

// --------- ETIQUETAS ---------

export interface EtiquetaWhatsApp {
  id: string;
  name: string;
  color?: number | string;
}

/**
 * Etiquetas existentes na conta.
 *
 * Só o canal Baileys tem isto: no Cloud API e no Evolution Channel o método
 * lança "Method not available". A instância do CRM é Baileys (medido), mas um
 * cliente que migrar para o oficial perde a função — daí o erro ser devolvido
 * em vez de lançado.
 */
export async function listarEtiquetas(
  instanceName: string,
): Promise<EvolutionResult<EtiquetaWhatsApp[]>> {
  const res = await call<any>(`/label/findLabels/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const lista = Array.isArray(res.data) ? res.data : (res.data?.labels ?? []);
  return {
    ok: true,
    data: (lista as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id ?? l.labelId ?? ""),
      name: String(l.name ?? ""),
      color: l.color as number | string | undefined,
    })),
  };
}

/**
 * Aplica (ou tira) uma etiqueta numa conversa.
 *
 * A Evolution pede o `labelId`, não o nome — e o nome é o que o usuário
 * configura na tela. A tradução acontece aqui, e falhar em achar devolve erro
 * explicando, em vez de aplicar a etiqueta errada em silêncio.
 */
export async function aplicarEtiquetaPorNome(
  instanceName: string,
  phone: string,
  nomeDaEtiqueta: string,
  acao: "add" | "remove" = "add",
): Promise<EvolutionResult<{ labelId: string }>> {
  const etiquetas = await listarEtiquetas(instanceName);
  if (!etiquetas.ok) return { ok: false, error: etiquetas.error };

  const alvo = (etiquetas.data ?? []).find(
    (e) => e.name.trim().toLowerCase() === nomeDaEtiqueta.trim().toLowerCase(),
  );
  if (!alvo?.id) {
    // A Evolution não cria etiqueta: ela só associa uma que já existe. Dizer
    // isso é melhor que um "falhou" que manda o usuário procurar bug no CRM.
    return {
      ok: false,
      error: `A etiqueta "${nomeDaEtiqueta}" não existe no WhatsApp. Crie no aparelho primeiro — a API só aplica etiquetas já existentes.`,
    };
  }

  const res = await call<unknown>(`/label/handleLabel/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { number: phone.replace(/\D+/g, ""), labelId: alvo.id, action: acao },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { labelId: alvo.id } };
}
