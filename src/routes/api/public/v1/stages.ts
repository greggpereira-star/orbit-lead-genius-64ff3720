/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/v1/stages — etapas do funil da empresa da chave.
 * Quem cria ou move lead precisa dos ids das etapas.
 */
export const Route = createFileRoute("/api/public/v1/stages")({
  server: {
    handlers: {
      POST: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET"),
      PUT: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET"),
      PATCH: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET"),
      DELETE: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET"),
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autenticarApi, resposta, erroDaApi } = await import("@/lib/apiPublica.server");
        const admin = supabaseAdmin as any;

        const auth = await autenticarApi(request, admin, "leads:read");
        if (!auth.ok) return auth.resposta;

        const { data, error } = await admin
          .from("stages")
          .select("id, name, kind, order_index, is_entry")
          .eq("company_id", auth.ctx.companyId)
          .order("order_index", { ascending: true });
        if (error) return erroDaApi(503, "unavailable", "Serviço indisponível. Tente novamente.");

        return resposta({
          data: (data ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            position: s.order_index,
            is_entry: s.is_entry,
          })),
        });
      },
    },
  },
});
