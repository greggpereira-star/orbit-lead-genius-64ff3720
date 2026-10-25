/**
 * Permissões por empresa. Só dono/administrador altera; a leitura é direta pelo
 * navegador (RLS por membro). Quem de fato barra a ação é o banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { empresaParaAdministrar } from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const salvarPermissoesDaEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ membrosExcluemLeads: z.boolean(), membrosExportam: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { error } = await admin.from("company_permissoes").upsert(
      {
        company_id: companyId,
        membros_excluem_leads: data.membrosExcluemLeads,
        membros_exportam: data.membrosExportam,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
