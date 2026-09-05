/**
 * WhatsApp (Evolution API) — funções de servidor da tela de configuração.
 * Módulo client-safe: os imports server-only ficam dentro dos `.handler()`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveCompanyId(admin: unknown, userId: string): Promise<string> {
  const client = admin as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: unknown) => {
          limit: (n: number) => {
            maybeSingle: () => Promise<{ data: { company_id: string } | null }>;
          };
        };
      };
    };
  };
  const { data } = await client
    .from("memberships")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Usuário sem empresa vinculada.");
  return data.company_id;
}

/** Nome estável e único por empresa — a Evolution exige unicidade global. */
function instanceNameFor(companyId: string): string {
  return `altflow_${companyId.replace(/-/g, "").slice(0, 20)}`;
}

const DEFAULT_SETTINGS = {
  greeting_enabled: false,
  greeting_template:
    "Olá {{nome}}! 👋 Recebemos seu contato e um consultor já vai falar com você por aqui.",
  broker_alert_enabled: false,
  broker_alert_phone: null as string | null,
  broker_alert_template:
    "🔔 Novo lead: {{nome}}\nTelefone: {{telefone}}\nCampanha: {{campanha}}\nAbrir conversa: {{link}}",
  quiet_hours_start: 8,
  quiet_hours_end: 21,
  min_interval_seconds: 8,
};

// -------------------------------------------------------------
// getWhatsAppStatus — conexão + configurações + últimas mensagens
// -------------------------------------------------------------

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getInstanceState, isEvolutionConfigured, pingEvolution } = await import(
      "@/lib/evolution.server"
    );
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    // Testa alcance de verdade, não só presença das variáveis.
    const health = await pingEvolution();

    const [{ data: instance }, { data: settings }, { data: messages }] = await Promise.all([
      (supabaseAdmin as any)
        .from("whatsapp_instances")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("whatsapp_automation_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("whatsapp_messages")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Estado real vem da Evolution; o banco é só cache. Se divergir, corrige —
    // a sessão pode cair sozinha (celular desligado, WhatsApp Web desconectado).
    let liveState: string | null = null;
    if (instance?.instance_name && isEvolutionConfigured() && health.reachable) {
      const state = await getInstanceState(instance.instance_name);
      if (state.ok && state.data) {
        liveState = state.data.state;
        const status = state.data.connected ? "connected" : "disconnected";
        if (status !== instance.status) {
          await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .update({
              status,
              updated_at: new Date().toISOString(),
              ...(state.data.connected ? { last_connected_at: new Date().toISOString() } : {}),
            })
            .eq("company_id", companyId);
          instance.status = status;
        }
      }
    }

    return {
      configured: isEvolutionConfigured(),
      reachable: health.reachable,
      healthError: health.error ?? null,
      evolutionVersion: health.version ?? null,
      instance: instance ?? null,
      liveState,
      settings: settings ?? { company_id: companyId, ...DEFAULT_SETTINGS },
      messages: messages ?? [],
    };
  });

// -------------------------------------------------------------
// connectWhatsApp — cria a instância e devolve o QR code
// -------------------------------------------------------------

export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createInstance, getQrCode, deleteInstance, isEvolutionConfigured } = await import(
      "@/lib/evolution.server"
    );
    if (!isEvolutionConfigured()) {
      throw new Error("Evolution API não configurada no servidor.");
    }

    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);
    const instanceName = instanceNameFor(companyId);

    // Recriar do zero evita herdar uma sessão meio-conectada de uma tentativa
    // anterior — a Evolution não reemite QR de instância em estado ruim.
    await deleteInstance(instanceName);

    // Webhook do caminho de volta: mantém o status da conexão correto em tempo
    // real e recebe as respostas dos leads. Só registra se houver segredo — sem
    // ele o endpoint recusa tudo, e apontar a Evolution pra um 401 é só ruído.
    const base = (process.env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
    const webhookUrl =
      base && secret
        ? `${base}/api/public/whatsapp-webhook?token=${encodeURIComponent(secret)}`
        : undefined;

    const created = await createInstance(instanceName, webhookUrl);
    if (!created.ok) {
      // Guarda a causa antes de subir o erro. Sem isto o motivo vivia só no
      // toast: bastava o usuário fechar a aba para a informação sumir, e a
      // investigação seguinte começava de uma captura de tela.
      await (supabaseAdmin as any).from("whatsapp_instances").upsert(
        {
          company_id: companyId,
          instance_name: instanceName,
          status: "error",
          last_error: (created.error ?? "Falha ao criar instância.").slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
      throw new Error(created.error ?? "Falha ao criar instância.");
    }

    let qr = created.data?.qrCodeBase64 ?? null;
    if (!qr) {
      const fetched = await getQrCode(instanceName);
      qr = fetched.data?.qrCodeBase64 ?? null;
    }

    await (supabaseAdmin as any).from("whatsapp_instances").upsert(
      {
        company_id: companyId,
        instance_name: instanceName,
        status: "connecting",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );

    // Garante que a linha de configurações exista já no primeiro acesso.
    await (supabaseAdmin as any)
      .from("whatsapp_automation_settings")
      .upsert({ company_id: companyId, ...DEFAULT_SETTINGS }, { onConflict: "company_id" });

    return { instanceName, qrCodeBase64: qr };
  });

// -------------------------------------------------------------
// refreshWhatsAppQr — o QR da Evolution expira em ~30s
// -------------------------------------------------------------

export const refreshWhatsAppQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getQrCode } = await import("@/lib/evolution.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { data: instance } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!instance?.instance_name) throw new Error("Nenhuma conexão iniciada.");

    const res = await getQrCode(instance.instance_name);
    if (!res.ok) throw new Error(res.error ?? "Falha ao gerar QR code.");
    return { qrCodeBase64: res.data?.qrCodeBase64 ?? null };
  });

// -------------------------------------------------------------
// disconnectWhatsApp
// -------------------------------------------------------------

export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteInstance } = await import("@/lib/evolution.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { data: instance } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", companyId)
      .maybeSingle();

    if (instance?.instance_name) await deleteInstance(instance.instance_name);

    await (supabaseAdmin as any).from("whatsapp_instances").delete().eq("company_id", companyId);
    return { ok: true };
  });

// -------------------------------------------------------------
// saveWhatsAppSettings
// -------------------------------------------------------------

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        greeting_enabled: z.boolean(),
        greeting_template: z.string().min(1, "A saudação não pode ficar vazia.").max(1000),
        broker_alert_enabled: z.boolean(),
        broker_alert_phone: z.string().max(30).nullable(),
        broker_alert_template: z.string().min(1, "O alerta não pode ficar vazio.").max(1000),
        quiet_hours_start: z.number().int().min(0).max(23),
        quiet_hours_end: z.number().int().min(0).max(23),
        min_interval_seconds: z.number().int().min(0).max(300),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toWhatsAppNumber } = await import("@/lib/evolution.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    // Falha cedo e com mensagem clara: um alerta ligado sem telefone válido
    // seria uma configuração que nunca dispara e ninguém entenderia por quê.
    if (data.broker_alert_enabled) {
      if (!toWhatsAppNumber(data.broker_alert_phone)) {
        throw new Error("Informe um telefone válido do corretor para ativar o alerta.");
      }
    }

    const { error } = await (supabaseAdmin as any)
      .from("whatsapp_automation_settings")
      .upsert(
        { company_id: companyId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "company_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------------------------------------------------
// sendWhatsAppTest — valida a conexão de ponta a ponta
// -------------------------------------------------------------

export const sendWhatsAppTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ phone: z.string().min(8) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendText } = await import("@/lib/evolution.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { data: instance } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!instance?.instance_name || instance.status !== "connected") {
      throw new Error("Conecte um número antes de enviar o teste.");
    }

    const body = "✅ Teste do Alt Flow Lead: sua automação de WhatsApp está funcionando.";
    const sent = await sendText(instance.instance_name, data.phone, body);

    await (supabaseAdmin as any).from("whatsapp_messages").insert({
      company_id: companyId,
      lead_id: null,
      direction: "outbound",
      kind: "manual",
      to_phone: data.phone,
      body,
      status: sent.ok ? "sent" : "failed",
      provider_message_id: sent.data?.messageId ?? null,
      error_message: sent.ok ? null : (sent.error ?? "erro desconhecido"),
    });

    if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar.");
    return { ok: true };
  });
