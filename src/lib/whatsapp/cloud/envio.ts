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
import { renderizarTexto } from "./render";
import { parametrosDoCorpo, variaveisDe } from "./templates";
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

// ---------------------------------------------------------------------------
// Template na conversa
// ---------------------------------------------------------------------------

export type MotivoDeRecusaDeTemplate =
  | MotivoDeRecusa
  | "template_inexistente"
  | "template_nao_aprovado"
  | "variavel_faltando"
  | "variavel_nao_suportada";

export type ResultadoDoEnvioDeTemplate =
  | { ok: true; messageId: string; providerMessageId: string; texto: string }
  | { ok: false; motivo: MotivoDeRecusaDeTemplate; texto: string };

/**
 * Envia um template aprovado. É o caminho de retomar conversa FORA da janela de
 * 24h — por isso não consulta a janela. Opt-out continua valendo.
 */
export async function enviarTemplateNaConversa(
  db: DbWa,
  entrada: {
    conversaId: string;
    nome: string;
    idioma: string;
    valores: Record<number, string>;
    enviadoPor: string | null;
    origem: "agent" | "automation";
  },
): Promise<ResultadoDoEnvioDeTemplate> {
  const admin = db as unknown as AdminDb;

  const { data: conv } = await (admin.from("wa_conversations") as ConsultaDb)
    .select("id, company_id, phone_number_id, contact_id")
    .eq("id", entrada.conversaId)
    .maybeSingle();
  const c = conv as {
    id: string;
    company_id: string;
    phone_number_id: string;
    contact_id: string;
  } | null;
  if (!c) return { ok: false, motivo: "conversa_inexistente", texto: "Conversa não encontrada." };

  const [{ data: contato }, { data: numero }] = await Promise.all([
    (admin.from("wa_contacts") as ConsultaDb)
      .select("wa_id, opted_out_at")
      .eq("id", c.contact_id)
      .maybeSingle(),
    (admin.from("wa_phone_numbers") as ConsultaDb)
      .select("phone_number_id, account_id")
      .eq("id", c.phone_number_id)
      .maybeSingle(),
  ]);
  const ct = contato as { wa_id: string; opted_out_at: string | null } | null;
  const nm = numero as { phone_number_id: string; account_id: string } | null;
  if (!ct || !nm)
    return { ok: false, motivo: "conversa_inexistente", texto: "Conversa incompleta." };

  if (ct.opted_out_at || (await numeroEmOptout(admin, c.company_id, ct.wa_id))) {
    return {
      ok: false,
      motivo: "contato_pediu_para_parar",
      texto: "O contato pediu para não receber mensagens.",
    };
  }

  const { data: modelo } = await (admin.from("wa_templates") as ConsultaDb)
    .select("status, components")
    .eq("account_id", nm.account_id)
    .eq("name", entrada.nome)
    .eq("language", entrada.idioma)
    .maybeSingle();
  const t = modelo as { status: string; components: Array<Record<string, unknown>> } | null;
  if (!t) return { ok: false, motivo: "template_inexistente", texto: "Template não encontrado." };
  if (t.status !== "APPROVED") {
    return {
      ok: false,
      motivo: "template_nao_aprovado",
      texto: "Este template ainda não foi aprovado pela Meta.",
    };
  }

  // Variável em cabeçalho ou botão exige parâmetros próprios; nesta fase só o
  // corpo é suportado — e recusar é melhor que mandar `132000` à Meta.
  const comVariavelFora = (t.components ?? []).some((cmp) => {
    const tipo = String(cmp.type ?? "").toUpperCase();
    if (tipo === "HEADER") return variaveisDe(String(cmp.text ?? "")).length > 0;
    if (tipo === "BUTTONS") {
      return ((cmp.buttons as Array<Record<string, unknown>>) ?? []).some(
        (b) => variaveisDe(String(b.url ?? "")).length > 0,
      );
    }
    return false;
  });
  if (comVariavelFora) {
    return {
      ok: false,
      motivo: "variavel_nao_suportada",
      texto:
        "Este template tem variável no cabeçalho ou em botão, ainda não suportada no atendimento.",
    };
  }

  const corpo = String(
    (t.components ?? []).find((x) => String(x.type).toUpperCase() === "BODY")?.text ?? "",
  );
  const params = parametrosDoCorpo(corpo, entrada.valores);
  if (!params.ok) {
    return {
      ok: false,
      motivo: "variavel_faltando",
      texto: `Preencha as variáveis: ${params.faltando.map((n) => `{{${n}}}`).join(", ")}.`,
    };
  }

  const provider = criarCloudProvider(admin);
  const componentes =
    params.parametros.length > 0 ? [{ type: "body", parameters: params.parametros }] : [];
  const r = await provider.sendTemplate(
    { provider: "cloud", referencia: nm.phone_number_id },
    ct.wa_id,
    entrada.nome,
    entrada.idioma,
    componentes,
  );
  if (!r.ok || !r.data?.messageId) {
    return { ok: false, motivo: "provedor", texto: r.error ?? "Falha ao enviar." };
  }

  const texto = renderizarTexto(corpo, entrada.valores);
  const { data: id, error } = await db.rpc("wa_registrar_saida", {
    p_conversation_id: c.id,
    p_origin: entrada.origem,
    p_provider_message_id: r.data.messageId,
    p_type: "template",
    p_body: texto,
    p_payload: {
      template: { name: entrada.nome, language: entrada.idioma, parameters: entrada.valores },
    },
    p_sent_by: entrada.enviadoPor,
    p_template_name: entrada.nome,
  });
  if (error) {
    console.error(
      JSON.stringify({ scope: "wa-envio", msg: "registro_template_falhou", erro: error.message }),
    );
  }
  return { ok: true, messageId: String(id ?? ""), providerMessageId: r.data.messageId, texto };
}

export { renderizarTexto };
