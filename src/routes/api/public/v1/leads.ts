/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

/**
 * GET  /api/public/v1/leads   lista (cursor, filtros)         escopo leads:read
 * POST /api/public/v1/leads   cria (Idempotency-Key opcional) escopo leads:write
 */
export const Route = createFileRoute("/api/public/v1/leads")({
  server: {
    handlers: {
      PUT: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, POST"),
      PATCH: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, POST"),
      DELETE: async () => (await import("@/lib/apiPublica.server")).metodoNaoPermitido("GET, POST"),
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autenticarApi } = await import("@/lib/apiPublica.server");
        const { listarLeads } = await import("@/lib/apiPublica/leads.server");
        const admin = supabaseAdmin as any;
        const auth = await autenticarApi(request, admin, "leads:read");
        if (!auth.ok) return auth.resposta;
        return listarLeads(admin, auth.ctx, new URL(request.url));
      },
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autenticarApi } = await import("@/lib/apiPublica.server");
        const { criarLead } = await import("@/lib/apiPublica/leads.server");
        const admin = supabaseAdmin as any;
        const auth = await autenticarApi(request, admin, "leads:write");
        if (!auth.ok) return auth.resposta;
        return criarLead(admin, auth.ctx, request);
      },
    },
  },
});
