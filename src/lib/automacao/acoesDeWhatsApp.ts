/**
 * Ações de WhatsApp do motor de automação.
 *
 * Saíram do despachante para serem testáveis. Três decisões que o texto antigo
 * não tinha, e que existem por causa da API oficial:
 *
 *  1. TEXTO só vai com a janela de 24h aberta; fora dela, a Meta recusa
 *     (131047) e cada recusa pesa na qualidade do número. A ação é "pulada",
 *     com o motivo — a regra certa para retomar conversa é a de TEMPLATE.
 *  2. Falha NÃO retentável (número fora do WhatsApp, template reprovado) vira
 *     "pulada", e não "falhou": retentar quatro vezes só gasta cota e qualidade.
 *     Só o que a Meta marca como temporário volta para a fila.
 *  3. Política de envio (opt-out e horário) vale para mensagem a LEAD, igual ao
 *     caminho legado; alerta a número fixo da empresa não passa por ela.
 */

import { toWhatsAppNumber } from "../whatsapp/numero";
import {
  decidirEnvio,
  horaEmSaoPaulo,
  janelaDaEmpresa,
  numeroEmOptout,
} from "../whatsapp/politica";
import { resolverCanal } from "../whatsapp/canal";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "../whatsapp/cloud/envio";
import type { DbWa } from "../whatsapp/cloud/processador";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface JobDeWhatsApp {
  company_id: string;
  lead_id: string | null;
  payload: Record<string, any> | null;
}

export interface ResultadoSimples {
  acao: string;
  status: "ok" | "pulada" | "falhou";
  detalhe?: string;
}

/** Troca `{{campo}}` pelo valor do payload. Campo ausente vira string vazia. */
export function preencher(modelo: string, payload: Record<string, any>): string {
  return modelo.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, chave) => {
    const v = payload[chave];
    return v == null ? "" : String(v);
  });
}

/** `{ "1": "{{nome}}", "2": "{{origem}}" }` + payload → `{ 1: "Ana", 2: "form" }`. */
export function valoresDoTemplate(
  variaveis: unknown,
  payload: Record<string, any>,
): Record<number, string> {
  const saida: Record<number, string> = {};
  if (!variaveis || typeof variaveis !== "object") return saida;
  for (const [k, v] of Object.entries(variaveis as Record<string, unknown>)) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0 && typeof v === "string")
      saida[n] = preencher(v, payload).trim();
  }
  return saida;
}

type Tipo = "enviar_whatsapp" | "enviar_template";

export async function acaoEnviarWhatsApp(
  admin: any,
  job: JobDeWhatsApp,
  cfg: Record<string, any>,
  tipo: Tipo,
): Promise<ResultadoSimples> {
  const payload = job.payload ?? {};
  const canal = await resolverCanal(admin, job.company_id);
  if (!canal.ok) {
    return {
      acao: tipo,
      status: "pulada",
      detalhe:
        canal.motivo === "nao_configurado" ? "Evolution não configurada" : "WhatsApp não conectado",
    };
  }

  // Destino: número fixo (alerta interno) ou o telefone do próprio lead.
  const destino = String(cfg.para ?? payload.telefone ?? "").trim();
  const paraLead = !String(cfg.para ?? "").trim();

  const texto =
    tipo === "enviar_whatsapp" ? preencher(String(cfg.mensagem ?? ""), payload).trim() : "";
  const nomeDoTemplate = tipo === "enviar_template" ? String(cfg.template ?? "").trim() : "";
  if (
    !destino ||
    (tipo === "enviar_whatsapp" && !texto) ||
    (tipo === "enviar_template" && !nomeDoTemplate)
  ) {
    return {
      acao: tipo,
      status: "pulada",
      detalhe:
        tipo === "enviar_template" ? "sem destino ou sem template" : "sem destino ou sem mensagem",
    };
  }
  if (tipo === "enviar_template" && canal.provider.id !== "cloud") {
    return { acao: tipo, status: "pulada", detalhe: "Template exige a API oficial do WhatsApp" };
  }

  const numero = toWhatsAppNumber(destino);

  if (paraLead) {
    const decisao = decidirEnvio({
      numero,
      optedOut: numero ? await numeroEmOptout(admin, job.company_id, numero) : false,
      hora: horaEmSaoPaulo(),
      janela: await janelaDaEmpresa(admin, job.company_id),
    });
    if (!decisao.enviar) {
      // Registrado: é a tela que o cliente audita, e "por que não foi?" precisa
      // ter resposta lá.
      await admin.from("whatsapp_messages").insert({
        company_id: job.company_id,
        lead_id: job.lead_id,
        direction: "outbound",
        to_phone: numero ?? destino,
        body: "",
        status: "skipped",
        skipped_reason: decisao.texto,
        kind: "automacao",
      });
      return { acao: tipo, status: "pulada", detalhe: decisao.texto };
    }
  }

  // ---- API oficial ---------------------------------------------------------
  if (canal.provider.id === "cloud") {
    if (!numero) return { acao: tipo, status: "pulada", detalhe: "Telefone ausente ou inválido" };

    let conversaId: string | null = null;
    // A conversa que disparou o evento, quando o destino é o próprio contato.
    if (paraLead && typeof payload.conversation_id === "string" && payload.wa_id === numero) {
      conversaId = payload.conversation_id;
    }
    if (!conversaId) {
      const { data, error } = await admin.rpc("wa_obter_ou_criar_conversa", {
        p_company_id: job.company_id,
        p_wa_id: numero,
        p_lead_id: paraLead ? job.lead_id : null,
        p_profile_name: paraLead ? (payload.nome ?? null) : null,
      });
      if (error || !data) {
        return {
          acao: tipo,
          status: "falhou",
          detalhe: error?.message ?? "não consegui abrir a conversa",
        };
      }
      conversaId = String(data);
    }

    const db = admin as DbWa;
    const r =
      tipo === "enviar_template"
        ? await enviarTemplateNaConversa(db, {
            conversaId,
            nome: nomeDoTemplate,
            idioma: String(cfg.idioma ?? "pt_BR"),
            valores: valoresDoTemplate(cfg.variaveis, payload),
            enviadoPor: null,
            origem: "automation",
          })
        : await enviarTextoNaConversa(db, {
            conversaId,
            texto,
            enviadoPor: null,
            origem: "automation",
          });

    if (r.ok) return { acao: tipo, status: "ok", detalhe: numero };

    if (r.motivo === "fora_da_janela") {
      return {
        acao: tipo,
        status: "pulada",
        detalhe: "Janela de 24h fechada: use a ação Enviar template para retomar a conversa",
      };
    }
    // Só o temporário volta para a fila; o resto é decisão ou configuração.
    if (r.motivo === "provedor" && r.retentavel) {
      return { acao: tipo, status: "falhou", detalhe: r.texto };
    }
    return { acao: tipo, status: "pulada", detalhe: r.texto };
  }

  // ---- Evolution (legado, até o corte da empresa) --------------------------
  const textoFinal = tipo === "enviar_whatsapp" ? texto : "";
  const r = await canal.provider.sendText(canal.canal, destino, textoFinal);
  if (!r.ok) return { acao: tipo, status: "falhou", detalhe: r.error };

  await admin.from("whatsapp_messages").insert({
    company_id: job.company_id,
    lead_id: job.lead_id,
    direction: "outbound",
    to_phone: destino,
    body: textoFinal,
    status: "sent",
    provider_message_id: r.data?.messageId ?? null,
    kind: "automacao",
  });
  return { acao: tipo, status: "ok", detalhe: destino };
}

export async function acaoAtribuirConversa(
  admin: any,
  job: JobDeWhatsApp,
  cfg: Record<string, any>,
): Promise<ResultadoSimples> {
  const tipo = "atribuir_conversa";
  const conversaId =
    typeof job.payload?.conversation_id === "string"
      ? (job.payload.conversation_id as string)
      : null;
  if (!conversaId) return { acao: tipo, status: "pulada", detalhe: "sem conversa" };

  // Quem recebe: o usuário da regra, senão o responsável pelo lead.
  let userId: string | null = typeof cfg.user_id === "string" && cfg.user_id ? cfg.user_id : null;
  if (!userId && job.lead_id) {
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", job.lead_id)
      .eq("company_id", job.company_id)
      .maybeSingle();
    userId = (lead?.assigned_to as string | null) ?? null;
  }
  if (!userId) return { acao: tipo, status: "pulada", detalhe: "nenhum responsável resolvido" };

  const { data: membro } = await admin
    .from("memberships")
    .select("user_id")
    .eq("company_id", job.company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membro) return { acao: tipo, status: "falhou", detalhe: "responsável não é da empresa" };

  const { error } = await admin
    .from("wa_conversations")
    .update({ assigned_to: userId })
    .eq("id", conversaId)
    .eq("company_id", job.company_id);
  if (error) return { acao: tipo, status: "falhou", detalhe: error.message };
  return { acao: tipo, status: "ok", detalhe: userId };
}
