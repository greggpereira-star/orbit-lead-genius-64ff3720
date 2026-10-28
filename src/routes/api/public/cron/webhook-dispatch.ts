/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { autorizarCron, respostaDeRecusa } from "@/lib/cron.server";

/**
 * Envia a fila de webhooks de saída (a cada minuto).
 *
 * O gatilho do banco só ENFILEIRA, em microssegundos, dentro da transação do lead.
 * O envio mora aqui porque chama a rede de terceiros: demora, falha e precisa de
 * tentativas — nada disso pode prender a gravação do lead.
 */
export const Route = createFileRoute("/api/public/cron/webhook-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const autorizacao = autorizarCron(request);
        if (!autorizacao.ok) return respostaDeRecusa(autorizacao);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { despacharLote } = await import("@/lib/webhooks/entrega.server");
        const admin = supabaseAdmin as any;

        try {
          const resultado = await despacharLote(admin, 20);
          // Histórico de 30 dias; barato (índice em concluida_em) e evita um job só para isso.
          await admin.rpc("limpar_entregas_de_webhook").then(
            () => {},
            () => {},
          );
          return new Response(JSON.stringify(resultado), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          console.error(JSON.stringify({ scope: "webhooks", msg: "lote_falhou", erro: String(e) }));
          return new Response(JSON.stringify({ error: "falha ao processar o lote" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
