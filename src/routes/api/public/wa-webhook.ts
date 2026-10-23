import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da WhatsApp Cloud API.
 *
 *   GET  → verificação (`hub.challenge`), com `WA_WEBHOOK_VERIFY_TOKEN`.
 *   POST → eventos, com assinatura HMAC (`X-Hub-Signature-256`).
 *
 * Responde 200 depressa e grava o evento; o processamento é idempotente e pode
 * acontecer agora ou no varredor. Erro de processamento NUNCA vira HTTP de erro:
 * a Meta reentregaria em loop e, depois de muitas falhas, desativa o webhook.
 *
 * A empresa é resolvida pelo `phone_number_id` — nunca por campo do corpo.
 */
const LIMITE_CORPO_BYTES = 2 * 1024 * 1024;

export const Route = createFileRoute("/api/public/wa-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const esperado = process.env.WA_WEBHOOK_VERIFY_TOKEN;
        if (!esperado) return new Response("Not configured", { status: 503 });
        const url = new URL(request.url);
        const { segredoConfere } = await import("@/lib/segredo.server");
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          segredoConfere(url.searchParams.get("hub.verify_token"), esperado) &&
          url.searchParams.get("hub.challenge")
        ) {
          return new Response(url.searchParams.get("hub.challenge"), {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const { segredosDoApp } = await import("@/lib/whatsapp/cloud/assinatura");
        const segredos = segredosDoApp(process.env);
        if (segredos.length === 0) return new Response("Not configured", { status: 503 });

        /* Teto de corpo ANTES de ler: a assinatura só pode ser conferida depois
           de ter o corpo inteiro, então sem teto qualquer anônimo faz o
           servidor bufferizar o que quiser. Os payloads da Meta são pequenos. */
        const declarado = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declarado) && declarado > LIMITE_CORPO_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }
        const corpoCru = await request.text();
        if (corpoCru.length > LIMITE_CORPO_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }
        const { verificarAssinaturaMeta } = await import("@/lib/whatsapp/cloud/assinatura");
        const assinatura = request.headers.get("x-hub-signature-256");
        if (!segredos.some((segredo) => verificarAssinaturaMeta(corpoCru, assinatura, segredo))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let corpo: unknown;
        try {
          corpo = JSON.parse(corpoCru);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const { extrairEventos } = await import("@/lib/whatsapp/cloud/payload");
        const { guardarEventos, processarPendentes } =
          await import("@/lib/whatsapp/cloud/processador");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as never;

        const eventos = extrairEventos(corpo);
        try {
          await guardarEventos(db, eventos);
        } catch (e) {
          // Não gravou: pede reentrega (é o único caso em que o erro é nosso).
          console.error(
            JSON.stringify({ scope: "wa-webhook", msg: "guardar_falhou", erro: String(e) }),
          );
          return new Response("Retry", { status: 500 });
        }

        // Processa já, sem segurar a resposta. O varredor cobre o que sobrar.
        void processarPendentes(db, { limite: 50 }).catch((e) =>
          console.error(
            JSON.stringify({ scope: "wa-webhook", msg: "processar_falhou", erro: String(e) }),
          ),
        );

        return new Response("ok", { status: 200 });
      },
    },
  },
});
