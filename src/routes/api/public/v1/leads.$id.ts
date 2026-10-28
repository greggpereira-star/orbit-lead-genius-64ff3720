/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

/**
 * GET   /api/public/v1/leads/:id   um lead            escopo leads:read
 * PATCH /api/public/v1/leads/:id   atualiza / move    escopo leads:write
 */
export const Route = createFileRoute("/api/public/v1/leads/$id")({
  server: {
    handlers: {
      POST: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, PATCH"),
      PUT: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, PATCH"),
      DELETE: async () =>
        (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, PATCH"),
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autenticarApi } = await import("@/lib/apiPublica.server");
        const { buscarLead } = await import("@/lib/apiPublica/leads.server");
        const admin = supabaseAdmin as any;
        const auth = await autenticarApi(request, admin, "leads:read");
        if (!auth.ok) return auth.resposta;
        return buscarLead(admin, auth.ctx, params.id);
      },
      PATCH: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autenticarApi } = await import("@/lib/apiPublica.server");
        const { atualizarLead } = await import("@/lib/apiPublica/leads.server");
        const admin = supabaseAdmin as any;
        const auth = await autenticarApi(request, admin, "leads:write");
        if (!auth.ok) return auth.resposta;
        return atualizarLead(admin, auth.ctx, params.id, request);
      },
    },
  },
});
