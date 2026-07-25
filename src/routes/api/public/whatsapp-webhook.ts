/**
 * Webhook da Evolution API — caminho de volta do WhatsApp.
 *
 * Recebe dois eventos que importam:
 *   CONNECTION_UPDATE → mantém o status da instância correto em tempo real.
 *     Sem isso, só descobrimos que a sessão caiu quando alguém abre a tela.
 *   MESSAGES_UPSERT   → grava a resposta do lead e processa pedidos de opt-out.
 *
 * A Evolution não envia cabeçalho de autenticação para webhooks, então o
 * segredo viaja na query string e é comparado aqui. Sem segredo configurado o
 * endpoint recusa tudo — melhor mudo que aberto.
 */
import { createFileRoute } from "@tanstack/react-router";

function log(level: "info" | "warn" | "error", traceId: string, msg: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope: "whatsapp-webhook",
      trace_id: traceId,
      msg,
      ...extra,
    }),
  );
}

/** "SAIR", "parar", "Cancelar inscrição" — variações que significam "pare". */
const OPTOUT_PATTERN = /^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover)\b/i;

/**
 * Do JID da Evolution ("5527996318075@s.whatsapp.net") para dígitos puros.
 * Grupos (@g.us) são ignorados: automação de lead não fala em grupo.
 */
function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid || typeof jid !== "string") return null;
  if (jid.includes("@g.us")) return null;
  const digits = jid.split("@")[0]?.replace(/\D+/g, "") ?? "";
  return digits.length >= 8 ? digits : null;
}

/**
 * Variações do mesmo celular brasileiro por causa do nono dígito.
 *
 * O WhatsApp costuma reportar 55 + DDD + 8 dígitos para celulares antigos,
 * enquanto o cadastro guarda 55 + DDD + 9 dígitos (ou vice-versa). Comparar
 * só a string exata faz a resposta do lead chegar órfã.
 */
function phoneVariants(phone: string): string[] {
  const set = new Set<string>([phone]);

  if (phone.startsWith("55")) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);

    // 8 dígitos → tenta com o 9 na frente
    if (rest.length === 8) set.add(`55${ddd}9${rest}`);
    // 9 dígitos começando com 9 → tenta sem o 9
    if (rest.length === 9 && rest.startsWith("9")) set.add(`55${ddd}${rest.slice(1)}`);
  }

  // Sem DDI, para bases que guardaram só DDD + número
  if (phone.startsWith("55") && phone.length > 4) set.add(phone.slice(2));

  return [...set];
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const traceId = `wa_${crypto.randomUUID()}`;

        const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
        if (!secret) {
          log("error", traceId, "secret_not_configured");
          return new Response("not configured", { status: 503 });
        }

        const url = new URL(request.url);
        if (url.searchParams.get("token") !== secret) {
          log("warn", traceId, "unauthorized");
          return new Response("unauthorized", { status: 401 });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const event = String(payload?.event ?? "").toUpperCase().replace(/\./g, "_");
        const instanceName = payload?.instance ?? payload?.instanceName ?? null;
        if (!instanceName) {
          log("warn", traceId, "missing_instance");
          // 200 de propósito: a Evolution reenfileira em erro, e reenviar um
          // evento que nunca vamos entender só gera ruído.
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const { data: instance } = await admin
          .from("whatsapp_instances")
          .select("company_id, instance_name")
          .eq("instance_name", instanceName)
          .maybeSingle();

        if (!instance?.company_id) {
          log("warn", traceId, "unknown_instance", { instanceName });
          return new Response("ok", { status: 200 });
        }
        const companyId = instance.company_id as string;

        // ---- Estado da conexão -------------------------------------------
        if (event === "CONNECTION_UPDATE") {
          const state = payload?.data?.state ?? payload?.data?.connection ?? null;
          const connected = state === "open";
          await admin
            .from("whatsapp_instances")
            .update({
              status: connected ? "connected" : "disconnected",
              updated_at: new Date().toISOString(),
              ...(connected ? { last_connected_at: new Date().toISOString() } : {}),
            })
            .eq("company_id", companyId);
          log("info", traceId, "connection_update", { state });
          return new Response("ok", { status: 200 });
        }

        // ---- Mensagem recebida -------------------------------------------
        if (event === "MESSAGES_UPSERT") {
          // A Evolution manda ora um objeto, ora uma lista.
          const raw = payload?.data;
          const items = Array.isArray(raw) ? raw : [raw];

          for (const item of items) {
            if (!item?.key) continue;

            // Ecos das nossas próprias mensagens: já registramos no envio.
            if (item.key.fromMe) continue;

            const phone = jidToPhone(item.key.remoteJid);
            if (!phone) continue;

            const body: string =
              item.message?.conversation ??
              item.message?.extendedTextMessage?.text ??
              item.message?.imageMessage?.caption ??
              item.message?.videoMessage?.caption ??
              "";

            // Tenta ligar ao lead pelas variações do número (nono dígito).
            let leadId: string | null = null;
            const variants = phoneVariants(phone);
            for (const v of variants) {
              const { data: lead } = await admin
                .from("leads")
                .select("id")
                .eq("company_id", companyId)
                .ilike("phone", `%${v.slice(-8)}%`)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (lead?.id) {
                leadId = lead.id;
                break;
              }
            }

            await admin.from("whatsapp_messages").insert({
              company_id: companyId,
              lead_id: leadId,
              direction: "inbound",
              kind: "reply",
              to_phone: phone,
              body: body || "(mídia sem texto)",
              status: "received",
              provider_message_id: item.key.id ?? null,
            });

            // Pedido de descadastro: registra e nunca mais envia automático.
            if (body && OPTOUT_PATTERN.test(body)) {
              await admin
                .from("whatsapp_optouts")
                .upsert(
                  { company_id: companyId, phone, reason: body.slice(0, 200) },
                  { onConflict: "company_id,phone" },
                );
              log("info", traceId, "optout_registered", { phone });
            }
          }

          return new Response("ok", { status: 200 });
        }

        // Demais eventos são aceitos e ignorados de propósito.
        return new Response("ok", { status: 200 });
      },
    },
  },
});
