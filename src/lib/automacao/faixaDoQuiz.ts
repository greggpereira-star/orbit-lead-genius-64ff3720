/**
 * Envio da mensagem da faixa de pontuação ao concluir o quiz.
 *
 * Na API oficial, quem acabou de concluir um quiz quase nunca tem a janela de
 * 24h aberta (não escreveu antes) — então texto livre NÃO chega. A faixa passa a
 * poder apontar um TEMPLATE aprovado. Sem template, o texto só vai se a janela
 * estiver aberta, e do contrário o motivo é devolvido para o painel dizer o que
 * configurar, em vez de a mensagem "sumir".
 */

import { resolverCanal } from "../whatsapp/canal";
import { enviarTemplateNaConversa, enviarTextoNaConversa } from "../whatsapp/cloud/envio";
import type { DbWa } from "../whatsapp/cloud/processador";
import { valoresDoTemplate } from "./acoesDeWhatsApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TemplateDaFaixa {
  nome: string;
  idioma?: string;
  /** `{ "1": "{{nome}}", "2": "{{faixa}}" }` */
  variaveis?: Record<string, string>;
}

export interface EnvioDaFaixa {
  enviou: boolean;
  motivo?: string;
  /** `true` quando vale devolver a reserva e tentar de novo mais tarde. */
  retentavel?: boolean;
}

export async function enviarFaixaDoQuiz(
  admin: any,
  e: {
    companyId: string;
    leadId: string | null;
    /** Já normalizado (`toWhatsAppNumber`). */
    numero: string;
    nome: string | null;
    texto: string;
    template: TemplateDaFaixa | null | undefined;
    /** Dados para `{{nome}}`, `{{faixa}}` e variáveis exportadas pelos blocos. */
    dados: Record<string, string>;
  },
): Promise<EnvioDaFaixa> {
  const canal = await resolverCanal(admin, e.companyId);
  if (!canal.ok) return { enviou: false, motivo: canal.texto };

  // ---- Evolution (legado) ----
  if (canal.provider.id !== "cloud") {
    if (!e.texto.trim()) return { enviou: false, motivo: "faixa sem mensagem" };
    const r = await canal.provider.sendText(canal.canal, e.numero, e.texto);
    return r.ok ? { enviou: true } : { enviou: false, motivo: r.error, retentavel: true };
  }

  // ---- API oficial ----
  const { data: conversaId, error } = await admin.rpc("wa_obter_ou_criar_conversa", {
    p_company_id: e.companyId,
    p_wa_id: e.numero,
    p_lead_id: e.leadId,
    p_profile_name: e.nome,
  });
  if (error || !conversaId) {
    return {
      enviou: false,
      motivo: error?.message ?? "não consegui abrir a conversa",
      retentavel: true,
    };
  }

  const db = admin as DbWa;
  if (e.template?.nome?.trim()) {
    const r = await enviarTemplateNaConversa(db, {
      conversaId: String(conversaId),
      nome: e.template.nome.trim(),
      idioma: e.template.idioma || "pt_BR",
      valores: valoresDoTemplate(e.template.variaveis, e.dados),
      enviadoPor: null,
      origem: "automation",
    });
    return r.ok
      ? { enviou: true }
      : { enviou: false, motivo: r.texto, retentavel: r.motivo === "provedor" && r.retentavel };
  }

  if (!e.texto.trim()) {
    return { enviou: false, motivo: "faixa sem template nem mensagem" };
  }
  const r = await enviarTextoNaConversa(db, {
    conversaId: String(conversaId),
    texto: e.texto,
    enviadoPor: null,
    origem: "automation",
  });
  if (r.ok) return { enviou: true };
  if (r.motivo === "fora_da_janela") {
    return {
      enviou: false,
      motivo:
        "A janela de 24h está fechada: configure um template aprovado nesta faixa para a mensagem chegar.",
    };
  }
  return { enviou: false, motivo: r.texto, retentavel: r.motivo === "provedor" && r.retentavel };
}
