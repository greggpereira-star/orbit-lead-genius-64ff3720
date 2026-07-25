/**
 * Dispara as mensagens automáticas de WhatsApp quando um lead entra.
 *
 * Chamado em "fire and forget" a partir do processador de leads: nada aqui
 * pode lançar pra fora nem atrasar a gravação do lead. Todo caminho — sucesso,
 * falha ou pulo — vira uma linha em whatsapp_messages, que é o que a tela de
 * configuração mostra e o que permite auditar depois.
 *
 * Como a Evolution API usa o protocolo não-oficial do WhatsApp, o risco de
 * banimento é real. As proteções aqui existem por isso: janela de horário,
 * intervalo mínimo entre envios e uma saudação por lead (índice único no banco).
 */

import { sendText, isEvolutionConfigured, toWhatsAppNumber } from "./evolution.server";

type Admin = any;

export interface LeadWhatsAppInput {
  companyId: string;
  leadId: string;
  name: string | null;
  phone: string | null;
  campaign: string | null;
  source: string;
}

interface Settings {
  greeting_enabled: boolean;
  greeting_template: string;
  broker_alert_enabled: boolean;
  broker_alert_phone: string | null;
  broker_alert_template: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
  min_interval_seconds: number;
}

/** Primeiro nome só — "Olá João" soa melhor que "Olá João Batista Muniz". */
function firstName(full: string | null): string {
  if (!full) return "tudo bem";
  const clean = full.trim().split(/\s+/)[0] ?? "";
  if (!clean) return "tudo bem";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/**
 * Hora atual no fuso de São Paulo — o horário comercial que importa é o do
 * lead, não o UTC do servidor.
 */
function currentHourSaoPaulo(): number {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number.parseInt(formatted, 10);
}

function withinQuietHours(settings: Settings): boolean {
  const hour = currentHourSaoPaulo();
  if (Number.isNaN(hour)) return true;
  const { quiet_hours_start: start, quiet_hours_end: end } = settings;
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  // Janela que cruza a meia-noite (ex: 20h às 6h)
  return hour >= start || hour < end;
}

async function logMessage(
  admin: Admin,
  row: {
    company_id: string;
    lead_id: string | null;
    direction: "outbound" | "inbound";
    kind: string;
    to_phone: string;
    body: string;
    status: string;
    provider_message_id?: string | null;
    error_message?: string | null;
    skipped_reason?: string | null;
  },
): Promise<void> {
  await admin
    .from("whatsapp_messages")
    .insert(row)
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Envia a saudação ao lead e o alerta ao corretor, conforme configurado.
 * Nunca lança — devolve um resumo pra quem quiser logar.
 */
export async function dispatchLeadWhatsApp(
  admin: Admin,
  input: LeadWhatsAppInput,
): Promise<{ greeting: string; brokerAlert: string }> {
  const result = { greeting: "skipped", brokerAlert: "skipped" };

  try {
    if (!isEvolutionConfigured()) return result;

    const [{ data: settings }, { data: instance }] = await Promise.all([
      admin
        .from("whatsapp_automation_settings")
        .select("*")
        .eq("company_id", input.companyId)
        .maybeSingle(),
      admin
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("company_id", input.companyId)
        .maybeSingle(),
    ]);

    if (!settings) return result;
    const cfg = settings as Settings;

    if (!instance?.instance_name || instance.status !== "connected") {
      const reason = "WhatsApp não conectado";
      if (cfg.greeting_enabled && input.phone) {
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "greeting",
          to_phone: input.phone,
          body: "",
          status: "skipped",
          skipped_reason: reason,
        });
      }
      return result;
    }

    const instanceName = instance.instance_name as string;
    const inWindow = withinQuietHours(cfg);
    const vars = {
      nome: firstName(input.name),
      nome_completo: input.name ?? "",
      telefone: input.phone ?? "",
      campanha: input.campaign ?? "",
      origem: input.source,
    };

    // ---- Saudação ao lead ------------------------------------------------
    if (cfg.greeting_enabled) {
      const leadNumber = toWhatsAppNumber(input.phone);
      if (!leadNumber) {
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "greeting",
          to_phone: input.phone ?? "",
          body: "",
          status: "skipped",
          skipped_reason: "Telefone ausente ou inválido",
        });
      } else if (!inWindow) {
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "greeting",
          to_phone: leadNumber,
          body: "",
          status: "skipped",
          skipped_reason: `Fora da janela (${cfg.quiet_hours_start}h–${cfg.quiet_hours_end}h)`,
        });
      } else {
        const body = renderTemplate(cfg.greeting_template, vars);
        const sent = await sendText(instanceName, leadNumber, body);
        result.greeting = sent.ok ? "sent" : "failed";
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "greeting",
          to_phone: leadNumber,
          body,
          status: sent.ok ? "sent" : "failed",
          provider_message_id: sent.data?.messageId ?? null,
          error_message: sent.ok ? null : (sent.error ?? "erro desconhecido"),
        });
      }
    }

    // ---- Alerta ao corretor ---------------------------------------------
    if (cfg.broker_alert_enabled) {
      const brokerNumber = toWhatsAppNumber(cfg.broker_alert_phone);
      if (!brokerNumber) {
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "broker_alert",
          to_phone: cfg.broker_alert_phone ?? "",
          body: "",
          status: "skipped",
          skipped_reason: "Telefone do corretor não configurado",
        });
      } else {
        // Espaça os dois envios pra não disparar duas mensagens no mesmo
        // instante pelo mesmo número — padrão que costuma acionar bloqueio.
        const waitMs = Math.max(0, cfg.min_interval_seconds * 1000);
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

        const leadNumber = toWhatsAppNumber(input.phone);
        const body = renderTemplate(cfg.broker_alert_template, {
          ...vars,
          link: leadNumber ? `https://wa.me/${leadNumber}` : "(sem telefone)",
        });
        const sent = await sendText(instanceName, brokerNumber, body);
        result.brokerAlert = sent.ok ? "sent" : "failed";
        await logMessage(admin, {
          company_id: input.companyId,
          lead_id: input.leadId,
          direction: "outbound",
          kind: "broker_alert",
          to_phone: brokerNumber,
          body,
          status: sent.ok ? "sent" : "failed",
          provider_message_id: sent.data?.messageId ?? null,
          error_message: sent.ok ? null : (sent.error ?? "erro desconhecido"),
        });
      }
    }
  } catch {
    // Silencioso de propósito: WhatsApp nunca pode quebrar a criação do lead.
  }

  return result;
}
