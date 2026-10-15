import { createFileRoute } from "@tanstack/react-router";

/**
 * Varredor dos eventos de webhook do WhatsApp (`pending` e `failed`).
 *
 * FALHA FECHADO: sem `CRON_SECRET` configurado, recusa. As rotas de cron mais
 * antigas caem num texto padrão escrito no código quando a variável falta — e
 * ela falta em produção (medido em 15/10/2026). Esta não repete isso.
 */
export const Route = createFileRoute("/api/public/cron/wa-webhook-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env.CRON_SECRET;
        const { segredoConfere } = await import("@/lib/segredo.server");
        const enviado = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!segredo || !segredoConfere(enviado, segredo)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { processarPendentes } = await import("@/lib/whatsapp/cloud/processador");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const r = await processarPendentes(supabaseAdmin as never, { limite: 100 });
        return Response.json({ ok: true, ...r });
      },
    },
  },
});
