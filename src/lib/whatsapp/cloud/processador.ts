/**
 * Grava e processa os eventos do webhook da Cloud API.
 *
 * Duas etapas separadas de propósito:
 *   1. `guardarEventos`: insere cada evento em `wa_webhook_events` com chave de
 *      deduplicação. Rápido; é só isso que a rota faz antes de responder 200.
 *   2. `processarPendentes`: aplica os eventos no modelo. Idempotente — a
 *      deduplicação real está nas funções SQL (`wa_registrar_mensagem`,
 *      `wa_aplicar_status`), então processar duas vezes é inofensivo.
 *
 * Falha de processamento NÃO vira erro HTTP (a Meta reentregaria em loop): o
 * evento fica `failed`, com contador, e o varredor tenta de novo.
 */

import { registrarCliqueDeAnuncio } from "../../ctwa.server";
import { mesmaPessoa } from "../../../modules/crm/lib/identidadeDoLead";
import { variantesDoNumero } from "../numero";
import type { EventoWa, Referral } from "./payload";
import { pedeParaParar } from "./optout";
import { baixarEGuardarMidia, type DbComArmazenamento } from "./armazenamento";
import { extrairMidia } from "./midia";

export interface DbWa {
  from(tabela: string): unknown;
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

// Os encadeamentos do PostgREST variam por operação; a camada trata cada um
// como `any` local — o contrato testado é o das FUNÇÕES, não do cliente.
/* eslint-disable @typescript-eslint/no-explicit-any */
const tabela = (db: DbWa, nome: string): any => db.from(nome);

export const MAX_TENTATIVAS = 5;

export async function guardarEventos(db: DbWa, eventos: EventoWa[]): Promise<number> {
  if (eventos.length === 0) return 0;
  const linhas = eventos.map((e) => ({
    dedup_key: e.dedupKey,
    field: e.kind,
    phone_number_id: "phoneNumberId" in e ? e.phoneNumberId : null,
    payload: e as unknown as Record<string, unknown>,
  }));
  const { data, error } = await tabela(db, "wa_webhook_events")
    .upsert(linhas, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`falha ao guardar eventos: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

/** `referral` do webhook → o formato que a atribuição de anúncio já consome. */
export function referralParaClique(r: Referral) {
  return {
    ctwaClid: typeof r.ctwa_clid === "string" ? r.ctwa_clid : null,
    sourceId: typeof r.source_id === "string" ? r.source_id : null,
    sourceApp: null,
    sourceUrl: typeof r.source_url === "string" ? r.source_url : null,
    sourceType: typeof r.source_type === "string" ? r.source_type : null,
    title: typeof r.headline === "string" ? r.headline : null,
    body: typeof r.body === "string" ? r.body : null,
    raw: r as Record<string, unknown>,
  };
}

async function ligarContatoAoLead(
  db: DbWa,
  empresaId: string,
  conversaId: string,
  waId: string,
): Promise<string | null> {
  const { data: conv } = await tabela(db, "wa_conversations")
    .select("contact_id, lead_id")
    .eq("id", conversaId)
    .maybeSingle();
  if (!conv) return null;
  if (conv.lead_id) return conv.lead_id as string;

  // Busca LARGA pelo fim do número, confirmação ESTREITA pela identidade —
  // mesma regra do resto do CRM, para nenhum palpite virar vínculo.
  const { data: candidatos } = await tabela(db, "leads")
    .select("id, phone, email")
    .eq("company_id", empresaId)
    .ilike("phone", `%${waId.slice(-8)}%`)
    .order("created_at", { ascending: true })
    .limit(10);

  const variantes = variantesDoNumero(waId);
  const achado = (
    (candidatos ?? []) as Array<{ id: string; phone: string | null; email: string | null }>
  ).find((l) => variantes.some((v) => mesmaPessoa({ phone: v }, { phone: l.phone })));
  if (!achado) return null;

  await tabela(db, "wa_contacts").update({ lead_id: achado.id }).eq("id", conv.contact_id);
  await tabela(db, "wa_conversations").update({ lead_id: achado.id }).eq("id", conversaId);
  return achado.id;
}

export type Resultado = "processed" | "ignored";

export async function processarEvento(db: DbWa, e: EventoWa): Promise<Resultado> {
  switch (e.kind) {
    case "message": {
      const { data, error } = await db.rpc("wa_registrar_mensagem", {
        p_phone_number_id: e.phoneNumberId,
        p_wa_id: e.waId,
        p_profile_name: e.profileName,
        p_direction: "inbound",
        p_origin: "customer",
        p_provider_message_id: e.wamid,
        p_type: e.type,
        p_body: e.body,
        p_payload: e.payload,
        p_provider_ts: e.ts,
        p_referral: e.referral,
        p_status: "received",
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      const linha = (Array.isArray(data) ? data[0] : data) as
        | { out_conversa: string; out_mensagem: string; out_empresa: string; inserida: boolean }
        | undefined;
      // Reentrega: nada de efeito colateral (atribuição, opt-out, lead).
      if (!linha?.inserida) return "processed";

      const leadId = await ligarContatoAoLead(db, linha.out_empresa, linha.out_conversa, e.waId);

      // Mídia: registra e já tenta baixar — a URL da Meta expira. Falha aqui NÃO
      // derruba a mensagem (ela já foi gravada): a tela tenta de novo ao abrir.
      const midia = extrairMidia(e.type, e.payload);
      if (midia) {
        try {
          const { data: idMidia } = await db.rpc("wa_registrar_midia", {
            p_message_id: linha.out_mensagem,
            p_kind: midia.kind,
            p_provider_media_id: midia.providerMediaId,
            p_mime: midia.mime,
            p_sha256: midia.sha256,
            p_filename: midia.filename,
            p_storage_path: null,
          });
          const comArmazenamento = db as Partial<DbComArmazenamento>;
          if (idMidia && comArmazenamento.storage) {
            await baixarEGuardarMidia(db as DbComArmazenamento, String(idMidia));
          }
        } catch (err) {
          console.error(
            JSON.stringify({ scope: "wa-midia", msg: "download_adiado", erro: String(err) }),
          );
        }
      }

      if (e.referral) {
        await registrarCliqueDeAnuncio(db as never, {
          companyId: linha.out_empresa,
          leadId,
          phone: e.waId,
          clique: referralParaClique(e.referral),
          messageTimestamp: Math.floor(new Date(e.ts).getTime() / 1000),
        });
      }

      if (pedeParaParar(e.body)) {
        await tabela(db, "wa_contacts")
          .update({ opted_out_at: new Date().toISOString() })
          .eq("company_id", linha.out_empresa)
          .eq("wa_id", e.waId);
        // A política de envio consulta `whatsapp_optouts`; mantém uma fonte só.
        await tabela(db, "whatsapp_optouts").upsert(
          { company_id: linha.out_empresa, phone: e.waId, reason: (e.body ?? "").slice(0, 200) },
          { onConflict: "company_id,phone" },
        );
      }
      return "processed";
    }

    case "echo": {
      const { error } = await db.rpc("wa_registrar_mensagem", {
        p_phone_number_id: e.phoneNumberId,
        p_wa_id: e.waId,
        p_profile_name: null,
        p_direction: "outbound",
        p_origin: "app_echo",
        p_provider_message_id: e.wamid,
        p_type: e.type,
        p_body: e.body,
        p_payload: e.payload,
        p_provider_ts: e.ts,
        p_referral: null,
        p_status: "sent",
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    case "history_message": {
      const { error } = await db.rpc("wa_registrar_mensagem", {
        p_phone_number_id: e.phoneNumberId,
        p_wa_id: e.waId,
        p_profile_name: null,
        p_direction: e.doNegocio ? "outbound" : "inbound",
        p_origin: "history",
        p_provider_message_id: e.wamid,
        p_type: e.type,
        p_body: e.body,
        p_payload: e.payload,
        p_provider_ts: e.ts,
        p_referral: null,
        p_status: e.doNegocio ? "sent" : "received",
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    case "status": {
      const { error } = await db.rpc("wa_aplicar_status", {
        p_phone_number_id: e.phoneNumberId,
        p_provider_message_id: e.wamid,
        p_status: e.status,
        p_occurred_at: e.ts,
        p_pricing: e.pricing,
        p_error: e.error
          ? { code: e.error.code, title: e.error.title, details: e.error.details }
          : null,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    case "template_status": {
      const { error } = await db.rpc("wa_aplicar_status_de_template", {
        p_waba_id: e.wabaId,
        p_name: e.name,
        p_language: e.language,
        p_status: e.status,
        p_reason: e.reason,
        p_provider_template_id: e.providerTemplateId,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    case "conta": {
      // Só os eventos que mudam o estado do número; o resto é ruído conhecido.
      const novo =
        e.evento === "PARTNER_REMOVED" || e.evento === "ACCOUNT_OFFBOARDED"
          ? "disconnected"
          : e.evento === "ACCOUNT_RECONNECTED"
            ? "active"
            : null;
      if (!novo) return "ignored";
      const { error } = await db.rpc("wa_atualizar_estado_do_numero", {
        p_waba_id: e.wabaId,
        p_display_phone: e.displayPhone,
        p_status: novo,
        p_reason: e.motivo ?? e.evento,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    case "historico_progresso": {
      const { error } = await db.rpc("wa_atualizar_historico", {
        p_phone_number_id: e.phoneNumberId,
        p_progress: e.progress,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return "processed";
    }

    default:
      return "ignored";
  }
}

/** Número que a Meta cita e que não é de nenhuma empresa nossa: não é erro, é ruído. */
function ehNumeroDesconhecido(e: unknown): boolean {
  const x = e as { code?: string; message?: string };
  return x?.code === "P0002" || /^numero_desconhecido/.test(x?.message ?? "");
}

/** 2, 4, 8... minutos, no máximo 60. */
export function proximaTentativa(tentativas: number, agora = Date.now()): string {
  const minutos = Math.min(60, 2 ** Math.max(1, tentativas));
  return new Date(agora + minutos * 60_000).toISOString();
}

export async function processarPendentes(
  db: DbWa,
  opcoes: { limite?: number } = {},
): Promise<{ processados: number; ignorados: number; falhos: number }> {
  const { data } = await tabela(db, "wa_webhook_events")
    .select("id, payload, attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_TENTATIVAS)
    /* Espera crescente entre tentativas: sem isto um evento com defeito era
       reprocessado a cada rodada do varredor, até esgotar em segundos. */
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("received_at", { ascending: true })
    .limit(opcoes.limite ?? 50);

  const contagem = { processados: 0, ignorados: 0, falhos: 0 };
  for (const linha of (data ?? []) as Array<{ id: string; payload: EventoWa; attempts: number }>) {
    try {
      const r = await processarEvento(db, linha.payload);
      await tabela(db, "wa_webhook_events")
        .update({
          status: r === "ignored" ? "ignored" : "processed",
          attempts: linha.attempts + 1,
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", linha.id);
      if (r === "ignored") contagem.ignorados += 1;
      else contagem.processados += 1;
    } catch (e) {
      const desconhecido = ehNumeroDesconhecido(e);
      await tabela(db, "wa_webhook_events")
        .update({
          status: desconhecido ? "ignored" : "failed",
          attempts: linha.attempts + 1,
          next_attempt_at: proximaTentativa(linha.attempts + 1),
          last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        })
        .eq("id", linha.id);
      if (desconhecido) contagem.ignorados += 1;
      else contagem.falhos += 1;
    }
  }
  return contagem;
}
