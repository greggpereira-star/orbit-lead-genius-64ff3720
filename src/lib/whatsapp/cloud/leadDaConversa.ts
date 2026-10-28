/**
 * Lead criado (ou ligado) a partir da conversa do WhatsApp.
 *
 * Sem isto a conversa só se ligava a um lead SOZINHA, na próxima mensagem, e só se o
 * telefone coincidisse. O atendente via "este contato ainda não é um lead" sem ter o
 * que fazer — no momento de maior intenção, com o cliente acabando de escrever.
 *
 * O id da conversa vem do navegador: aqui ele é conferido contra a EMPRESA da sessão
 * antes de qualquer coisa. Falha de consulta nunca derruba a criação (o pior caso de
 * não achar um duplicado é um lead a mais; o de barrar é perder o contato), mas o
 * vínculo manual só liga quando o telefone do lead BATE com o da conversa.
 */
import {
  acharDuplicado,
  finalDoTelefone,
  mesmaPessoa,
  normalizarEmail,
} from "@/modules/crm/lib/identidadeDoLead";
import { validarEmail } from "@/modules/quiz/lib/email";
import { formatarTelefone } from "@/modules/atendimento/lib/conversas";
import { variantesDoNumero } from "../numero";
import type { DbWa } from "./processador";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabela = (db: DbWa, nome: string): any => db.from(nome);

export const ORIGEM_ANUNCIO = "Anúncio no WhatsApp";
export const ORIGEM_ATENDIMENTO = "WhatsApp";

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Origem automática: conversa que chegou por anúncio Click-to-WhatsApp (tem `referral`
 * no `origin`) nasce como "Anúncio no WhatsApp", com o anúncio guardado no lead.
 */
export function origemDaConversa(origin: Record<string, unknown> | null | undefined): {
  source: string;
  anuncio: Record<string, string> | null;
} {
  if (!origin || typeof origin !== "object" || Object.keys(origin).length === 0) {
    return { source: ORIGEM_ATENDIMENTO, anuncio: null };
  }
  const anuncio: Record<string, string> = {};
  for (const [chave, valor] of [
    ["source_id", origin.source_id],
    ["source_type", origin.source_type],
    ["headline", origin.headline],
    ["ctwa_clid", origin.ctwa_clid],
  ] as const) {
    const v = txt(valor);
    if (v) anuncio[chave] = v;
  }
  return { source: ORIGEM_ANUNCIO, anuncio: Object.keys(anuncio).length > 0 ? anuncio : null };
}

export type ResultadoDeLeadDaConversa =
  | { ok: true; leadId: string; jaLigado: boolean }
  | {
      ok: false;
      duplicado: {
        id: string;
        name: string | null;
        stage: string | null;
        createdAt: string | null;
      };
    }
  | { ok: false; texto: string };

async function carregarConversa(db: DbWa, companyId: string, conversaId: string) {
  const { data: conv } = await tabela(db, "wa_conversations")
    .select("id, company_id, contact_id, lead_id, origin")
    .eq("id", conversaId)
    .maybeSingle();
  if (!conv || conv.company_id !== companyId) return null;
  const { data: contato } = await tabela(db, "wa_contacts")
    .select("id, wa_id, profile_name, lead_id")
    .eq("id", conv.contact_id)
    .maybeSingle();
  if (!contato?.wa_id) return null;
  return {
    conv: conv as {
      id: string;
      contact_id: string;
      lead_id: string | null;
      origin: Record<string, unknown> | null;
    },
    contato: contato as {
      id: string;
      wa_id: string;
      profile_name: string | null;
      lead_id: string | null;
    },
  };
}

async function ligar(db: DbWa, conv: { id: string }, contato: { id: string }, leadId: string) {
  await tabela(db, "wa_contacts").update({ lead_id: leadId }).eq("id", contato.id);
  await tabela(db, "wa_conversations").update({ lead_id: leadId }).eq("id", conv.id);
}

async function acharDuplicadoDoTelefone(
  db: DbWa,
  companyId: string,
  waId: string,
  email: string | null,
) {
  const fim = finalDoTelefone(waId);
  const filtros: string[] = [];
  if (email) filtros.push(`email.ilike.${email}`);
  if (fim) filtros.push(`phone.like.%${fim}`);
  if (filtros.length === 0) return null;

  const { data, error } = await tabela(db, "leads")
    .select("id, name, email, phone, created_at, stage:stages(name)")
    .eq("company_id", companyId)
    .or(filtros.join(","))
    .limit(25);
  if (error) return null; // falha de consulta não impede a criação

  const candidatos = (data ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
    stage: { name: string } | null;
  }>;
  // Mesma regra do resto do CRM: o telefone da conversa vem em DDI+DDD, o do lead como foi digitado.
  const variantes = variantesDoNumero(waId);
  const achado =
    candidatos.find((l) => variantes.some((v) => mesmaPessoa({ phone: v }, { phone: l.phone }))) ??
    acharDuplicado({ email }, candidatos);
  if (!achado) return null;
  const completo = candidatos.find((c) => c.id === achado.id);
  return {
    id: achado.id,
    name: achado.name ?? null,
    stage: completo?.stage?.name ?? null,
    createdAt: completo?.created_at ?? null,
  };
}

export async function criarLeadDaConversa(
  db: DbWa,
  e: {
    companyId: string;
    userId: string;
    conversaId: string;
    nome?: string | null;
    email?: string | null;
  },
): Promise<ResultadoDeLeadDaConversa> {
  const base = await carregarConversa(db, e.companyId, e.conversaId);
  if (!base) return { ok: false, texto: "Conversa não encontrada." };
  const { conv, contato } = base;

  // Idempotente: duplo clique ou outra aba não cria dois leads.
  const jaTem = conv.lead_id ?? contato.lead_id;
  if (jaTem) {
    if (!conv.lead_id) await ligar(db, conv, contato, jaTem);
    return { ok: true, leadId: jaTem, jaLigado: true };
  }

  const email = normalizarEmail(e.email);
  if (email) {
    const erro = validarEmail(email);
    if (erro) return { ok: false, texto: erro };
  }

  const duplicado = await acharDuplicadoDoTelefone(db, e.companyId, contato.wa_id, email);
  if (duplicado) return { ok: false, duplicado };

  const telefone = formatarTelefone(contato.wa_id) || `+${contato.wa_id}`;
  const nome = txt(e.nome) ?? txt(contato.profile_name) ?? telefone;
  const { source, anuncio } = origemDaConversa(conv.origin);

  const { data: etapa } = await db.rpc("resolve_entry_stage", {
    p_company_id: e.companyId,
    p_preferred: null,
  });
  const agora = Date.now();
  const { data: lead, error } = await tabela(db, "leads")
    .insert({
      company_id: e.companyId,
      name: nome,
      email,
      phone: telefone,
      source,
      status: "new",
      stage_id: (etapa as string | null) ?? null,
      stage_entered_at: new Date(agora).toISOString(),
      board_order: -agora,
      score: 0,
      lead_score: 0,
      temperature: "cold",
      lead_temperature: "cold",
      metadata: {
        created_manually: true,
        created_from: "whatsapp_inbox",
        created_by: e.userId,
        conversation_id: conv.id,
        ...(anuncio ? { whatsapp_ad: anuncio } : {}),
      },
    })
    .select("id")
    .maybeSingle();
  if (error || !lead)
    return { ok: false, texto: error?.message ?? "Não foi possível criar o lead." };

  await tabela(db, "lead_events").insert({
    lead_id: lead.id,
    event_type: "lead_created",
    description: anuncio
      ? "Lead criado a partir do atendimento do WhatsApp (veio de anúncio)."
      : "Lead criado a partir do atendimento do WhatsApp.",
    metadata: { source: "whatsapp_inbox", conversation_id: conv.id },
  });
  await ligar(db, conv, contato, lead.id as string);
  // Sem anúncio na conversa, o lead nasce "WhatsApp" sem prova de origem: se a primeira
  // mensagem casar com uma regra da empresa ("vim pelo Instagram"), já nasce classificado.
  if (!anuncio) {
    try {
      await db.rpc("aplicar_regras_de_origem_ao_lead", { p_lead_id: lead.id });
    } catch {
      /* classificar é acessório: nunca barra a criação */
    }
  }
  return { ok: true, leadId: lead.id as string, jaLigado: false };
}

/** Liga a conversa a um lead que JÁ existe — só se o telefone do lead for o da conversa. */
export async function vincularConversaAoLead(
  db: DbWa,
  e: { companyId: string; userId: string; conversaId: string; leadId: string },
): Promise<{ ok: true; leadId: string } | { ok: false; texto: string }> {
  const base = await carregarConversa(db, e.companyId, e.conversaId);
  if (!base) return { ok: false, texto: "Conversa não encontrada." };
  const { conv, contato } = base;
  if (conv.lead_id && conv.lead_id !== e.leadId)
    return { ok: false, texto: "Esta conversa já está ligada a outro lead." };

  const { data: lead } = await tabela(db, "leads")
    .select("id, company_id, phone")
    .eq("id", e.leadId)
    .maybeSingle();
  if (!lead || lead.company_id !== e.companyId) return { ok: false, texto: "Lead não encontrado." };

  const variantes = variantesDoNumero(contato.wa_id);
  if (!variantes.some((v) => mesmaPessoa({ phone: v }, { phone: lead.phone as string | null }))) {
    return { ok: false, texto: "O telefone deste lead não é o do contato da conversa." };
  }

  await ligar(db, conv, contato, e.leadId);
  await tabela(db, "lead_events").insert({
    lead_id: e.leadId,
    event_type: "whatsapp_linked",
    description: "Conversa do WhatsApp ligada ao lead pelo atendimento.",
    metadata: { source: "whatsapp_inbox", conversation_id: conv.id, by: e.userId },
  });
  return { ok: true, leadId: e.leadId };
}
