/**
 * Envio de texto numa conversa da Cloud API — o ÚNICO caminho que o atendimento
 * (e depois as automações) usa para falar com um cliente.
 *
 * Ordem da política, igual à do restante do produto: opt-out → janela de 24h →
 * provedor → registro. Texto livre FORA da janela não é tentado: a Meta recusa
 * com 131047, e cada recusa conta contra a qualidade do número.
 */

import { numeroEmOptout } from "../politica";
import type { AdminDb, ConsultaDb } from "../provider";
import { criarCloudProvider } from "./cloud-provider";
import { estadoDaJanela } from "./janela";
import type { DbWa } from "./processador";

export type MotivoDeRecusa =
  | "conversa_inexistente"
  | "contato_pediu_para_parar"
  | "fora_da_janela"
  | "texto_vazio"
  | "provedor";

export type ResultadoDoEnvio =
  | { ok: true; messageId: string; providerMessageId: string }
  | { ok: false; motivo: MotivoDeRecusa; texto: string };

export async function enviarTextoNaConversa(
  db: DbWa,
  entrada: {
    conversaId: string;
    texto: string;
    enviadoPor: string | null;
    origem: "agent" | "automation";
    agora?: Date;
  },
): Promise<ResultadoDoEnvio> {
  const texto = entrada.texto.trim();
  if (!texto) return { ok: false, motivo: "texto_vazio", texto: "Escreva uma mensagem." };

  const admin = db as unknown as AdminDb;

  const { data: conv } = await (admin.from("wa_conversations") as ConsultaDb)
    .select("id, company_id, phone_number_id, contact_id, last_inbound_at")
    .eq("id", entrada.conversaId)
    .maybeSingle();
  const c = conv as {
    id: string;
    company_id: string;
    phone_number_id: string;
    contact_id: string;
    last_inbound_at: string | null;
  } | null;
  if (!c) return { ok: false, motivo: "conversa_inexistente", texto: "Conversa não encontrada." };

  const [{ data: contato }, { data: numero }] = await Promise.all([
    (admin.from("wa_contacts") as ConsultaDb)
      .select("wa_id, opted_out_at")
      .eq("id", c.contact_id)
      .maybeSingle(),
    (admin.from("wa_phone_numbers") as ConsultaDb)
      .select("phone_number_id")
      .eq("id", c.phone_number_id)
      .maybeSingle(),
  ]);
  const ct = contato as { wa_id: string; opted_out_at: string | null } | null;
  const nm = numero as { phone_number_id: string } | null;
  if (!ct || !nm)
    return { ok: false, motivo: "conversa_inexistente", texto: "Conversa incompleta." };

  // 1) opt-out — a coluna do contato OU a lista legada (uma fonte só, a política).
  if (ct.opted_out_at || (await numeroEmOptout(admin, c.company_id, ct.wa_id))) {
    return {
      ok: false,
      motivo: "contato_pediu_para_parar",
      texto: "O contato pediu para não receber mensagens.",
    };
  }

  // 2) janela de 24h
  const janela = estadoDaJanela(c.last_inbound_at, entrada.agora);
  if (!janela.aberta) {
    return {
      ok: false,
      motivo: "fora_da_janela",
      texto: "A janela de 24h está fechada. Envie um template aprovado para retomar a conversa.",
    };
  }

  // 3) provedor
  const provider = criarCloudProvider(admin);
  const r = await provider.sendText(
    { provider: "cloud", referencia: nm.phone_number_id },
    ct.wa_id,
    texto,
  );
  if (!r.ok || !r.data?.messageId) {
    return { ok: false, motivo: "provedor", texto: r.error ?? "Falha ao enviar." };
  }

  // 4) registro (aplica status que já tenham chegado)
  const { data: id, error } = await db.rpc("wa_registrar_saida", {
    p_conversation_id: c.id,
    p_origin: entrada.origem,
    p_provider_message_id: r.data.messageId,
    p_type: "text",
    p_body: texto,
    p_payload: { text: { body: texto } },
    p_sent_by: entrada.enviadoPor,
    p_template_name: null,
  });
  if (error) {
    // A mensagem FOI enviada: o registro falhou. Não reportar como erro de envio
    // (o atendente reenviaria e o cliente receberia duas).
    console.error(
      JSON.stringify({ scope: "wa-envio", msg: "registro_falhou", erro: error.message }),
    );
  }
  return { ok: true, messageId: String(id ?? ""), providerMessageId: r.data.messageId };
}
