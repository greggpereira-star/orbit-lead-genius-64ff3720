/**
 * Entrega dos webhooks de saída.
 *
 * Semântica: "pelo menos uma vez". Uma entrega pode chegar repetida (resposta
 * perdida depois do processamento no destino), por isso todo evento leva um `id`
 * estável e o destinatário descarta repetição por ele.
 *
 * O servidor faz a requisição a uma URL que um membro da empresa digitou:
 * entrada não confiável. Por isso (a) o destino é revalidado a CADA envio — o DNS
 * pode ter mudado desde o cadastro —, (b) redirecionamento nunca é seguido e
 * (c) o corpo da resposta nunca é lido, só o status.
 */
import { validarDestinoDeWebhook } from "../redeSegura.server";
import { temRecurso } from "../planos.server";
import { decifrarToken } from "../whatsapp/cloud/cifra";
import { FALHAS_PARA_DESLIGAR, cabecalhoDeAssinatura, proximaEspera } from "./assinatura.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export const TEMPO_LIMITE_EM_MS = 8_000;
const PARALELISMO = 5;

export interface EntregaReservada {
  id: string;
  company_id: string;
  endpoint_id: string;
  evento: string;
  event_id: string;
  payload: unknown;
  attempts: number;
}

export interface ResultadoDoEnvio {
  ok: boolean;
  status: number | null;
  erro: string | null;
}

/** Um POST assinado. Não conhece banco nem fila — é o que o botão "enviar teste" também usa. */
export async function postarAssinado(
  entrada: {
    url: URL;
    segredo: string;
    evento: string;
    entregaId: string;
    eventId: string;
    payload: unknown;
    tentativa: number;
  },
  opcoes: { buscar?: typeof fetch; agoraEmSegundos?: number } = {},
): Promise<ResultadoDoEnvio> {
  const buscar = opcoes.buscar ?? fetch;
  const corpo = JSON.stringify(entrada.payload);
  const t = opcoes.agoraEmSegundos ?? Math.floor(Date.now() / 1000);

  try {
    const res = await buscar(entrada.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "Leadflow-Webhooks/1.0",
        "x-leadflow-event": entrada.evento,
        "x-leadflow-delivery": entrada.entregaId,
        "x-leadflow-event-id": entrada.eventId,
        "x-leadflow-attempt": String(entrada.tentativa),
        "x-leadflow-signature": cabecalhoDeAssinatura(entrada.segredo, t, corpo),
      },
      body: corpo,
    });
    // Só o status importa; não deixa a conexão presa lendo corpo de resposta.
    await res.body?.cancel().catch(() => {});

    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, erro: null };
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        status: res.status,
        erro: "o destino respondeu com redirecionamento (não é seguido)",
      };
    }
    return { ok: false, status: res.status, erro: `o destino respondeu ${res.status}` };
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    const msg =
      nome === "TimeoutError" || nome === "AbortError"
        ? `sem resposta em ${TEMPO_LIMITE_EM_MS / 1000}s`
        : "falha de conexão com o destino";
    return { ok: false, status: null, erro: msg };
  }
}

/** Só para teste: em produção valem sempre as versões reais (validação de rede e `fetch`). */
export interface DependenciasDeEntrega {
  validar?: typeof validarDestinoDeWebhook;
  postar?: typeof postarAssinado;
}

interface Endpoint {
  id: string;
  company_id: string;
  url: string;
  segredo: string;
  ativo: boolean;
}

async function finalizarComFalhaPermanente(
  admin: Admin,
  e: EntregaReservada,
  motivo: string,
  status: number | null,
) {
  await admin
    .from("webhook_deliveries")
    .update({
      status: "failed",
      concluida_em: new Date().toISOString(),
      ultimo_status: status,
      ultimo_erro: motivo.slice(0, 300),
    })
    .eq("id", e.id);
}

async function processarUma(
  admin: Admin,
  e: EntregaReservada,
  endpoints: Map<string, Promise<Endpoint | null>>,
  planos: Map<string, Promise<boolean>>,
  deps: DependenciasDeEntrega,
): Promise<"ok" | "adiada" | "falhou"> {
  if (!endpoints.has(e.endpoint_id)) {
    endpoints.set(
      e.endpoint_id,
      Promise.resolve(
        admin
          .from("webhook_endpoints")
          .select("id, company_id, url, segredo, ativo")
          .eq("id", e.endpoint_id)
          .maybeSingle(),
      ).then((r: any) => (r?.data as Endpoint | null) ?? null),
    );
  }
  const ep = await endpoints.get(e.endpoint_id)!;

  if (!ep || !ep.ativo) {
    await finalizarComFalhaPermanente(admin, e, "endpoint desativado ou removido", null);
    return "falhou";
  }

  if (!planos.has(ep.company_id))
    planos.set(ep.company_id, temRecurso(admin, ep.company_id, "webhooks_assinados"));
  if (!(await planos.get(ep.company_id)!)) {
    await finalizarComFalhaPermanente(
      admin,
      e,
      "o plano atual não inclui webhooks assinados",
      null,
    );
    return "falhou";
  }

  const destino = await (deps.validar ?? validarDestinoDeWebhook)(ep.url);
  if (!destino.ok) {
    // Endereço que virou interno depois do cadastro conta como falha do endpoint:
    // sem isto ele ficaria "ativo" apontando para dentro da nossa rede.
    await finalizarComFalhaPermanente(admin, e, `destino recusado: ${destino.motivo}`, null);
    await admin.rpc("registrar_falha_de_endpoint", {
      p_endpoint_id: ep.id,
      p_limite: FALHAS_PARA_DESLIGAR,
      p_motivo: `destino recusado: ${destino.motivo}`,
    });
    return "falhou";
  }

  // O segredo está cifrado em repouso. Se não der para ler (chave do servidor
  // ausente ou trocada), trata como falha COM nova tentativa: o evento não pode
  // ser perdido por um problema de configuração que se conserta depois.
  let segredo: string | null = null;
  try {
    segredo = decifrarToken(ep.segredo);
  } catch {
    segredo = null;
  }

  const r: ResultadoDoEnvio =
    segredo === null
      ? { ok: false, status: null, erro: "não foi possível ler o segredo de assinatura" }
      : await (deps.postar ?? postarAssinado)({
          url: destino.url,
          segredo,
          evento: e.evento,
          entregaId: e.id,
          eventId: e.event_id,
          payload: e.payload,
          tentativa: e.attempts,
        });

  const agora = new Date();
  if (r.ok) {
    await admin
      .from("webhook_deliveries")
      .update({
        status: "done",
        concluida_em: agora.toISOString(),
        ultimo_status: r.status,
        ultimo_erro: null,
      })
      .eq("id", e.id);
    await admin
      .from("webhook_endpoints")
      .update({ falhas_seguidas: 0, ultima_entrega_em: agora.toISOString() })
      .eq("id", ep.id);
    return "ok";
  }

  const espera = proximaEspera(e.attempts);
  if (espera !== null) {
    await admin
      .from("webhook_deliveries")
      .update({
        status: "pending",
        proxima_tentativa_em: new Date(agora.getTime() + espera * 1000).toISOString(),
        ultimo_status: r.status,
        ultimo_erro: r.erro,
      })
      .eq("id", e.id);
    return "adiada";
  }

  await finalizarComFalhaPermanente(admin, e, r.erro ?? "falha", r.status);
  await admin.rpc("registrar_falha_de_endpoint", {
    p_endpoint_id: ep.id,
    p_limite: FALHAS_PARA_DESLIGAR,
    p_motivo: `${FALHAS_PARA_DESLIGAR} entregas seguidas sem sucesso (última: ${r.erro ?? "falha"})`,
  });
  return "falhou";
}

export async function despacharLote(admin: Admin, limite = 20, deps: DependenciasDeEntrega = {}) {
  const { data, error } = await admin.rpc("reservar_entregas_de_webhook", { p_limite: limite });
  if (error) throw new Error(error.message);
  const lote = (data ?? []) as EntregaReservada[];

  const endpoints = new Map<string, Promise<Endpoint | null>>();
  const planos = new Map<string, Promise<boolean>>();
  const contagem = { reservadas: lote.length, ok: 0, adiadas: 0, falhas: 0 };

  // Em ondas de PARALELISMO: um destino lento não segura os outros, e o pior caso
  // (ondas × tempo limite) cabe na janela de 50 s do cron.
  for (let i = 0; i < lote.length; i += PARALELISMO) {
    const onda = lote.slice(i, i + PARALELISMO);
    const resultados = await Promise.all(
      onda.map((e) =>
        processarUma(admin, e, endpoints, planos, deps).catch(async (erro) => {
          // Exceção inesperada: devolve para a fila em vez de deixar 'running' até a liberação.
          console.error(
            JSON.stringify({
              scope: "webhooks",
              msg: "entrega_excecao",
              entrega: e.id,
              erro: String(erro),
            }),
          );
          await admin
            .from("webhook_deliveries")
            .update({
              status: "pending",
              proxima_tentativa_em: new Date(Date.now() + 60_000).toISOString(),
              ultimo_erro: "erro interno",
            })
            .eq("id", e.id);
          return "adiada" as const;
        }),
      ),
    );
    for (const r of resultados) {
      if (r === "ok") contagem.ok++;
      else if (r === "adiada") contagem.adiadas++;
      else contagem.falhas++;
    }
  }
  return contagem;
}
