/**
 * Meta Lead Ads webhook — public endpoint.
 * GET  → verification handshake (hub.challenge)
 * POST → leadgen events, HMAC-verified
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const verifyToken = process.env.META_VERIFY_TOKEN;
        if (!verifyToken) return new Response("Missing verify token", { status: 500 });
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === verifyToken && challenge) {
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) return new Response("Server not configured", { status: 500 });

        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        const { verifyMetaSignature, processMetaLeadEvent } = await import(
          "@/lib/meta-lead-processor.server"
        );
        if (!verifyMetaSignature(rawBody, signature, appSecret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          object?: string;
          entry?: Array<{
            id: string;
            time: number;
            changes?: Array<{
              field: string;
              value: { leadgen_id: string; page_id: string; form_id?: string; ad_id?: string; created_time?: number };
            }>;
          }>;
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (payload.object !== "page") {
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Process asynchronously so Meta gets 200 fast
        void (async () => {
          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              if (change.field !== "leadgen") continue;
              const v = change.value;
              try {
                await processMetaLeadEvent(supabaseAdmin as never, {
                  leadgenId: v.leadgen_id,
                  pageId: v.page_id,
                  formId: v.form_id,
                  adId: v.ad_id,
                  createdTime: v.created_time ? new Date(v.created_time * 1000).toISOString() : undefined,
                  rawPayload: change,
                });
              } catch (err) {
                console.error("[meta-webhook] process failed:", err);
              }
            }
          }
        })();

        return new Response("ok", { status: 200 });
      },
    },
  },
});
