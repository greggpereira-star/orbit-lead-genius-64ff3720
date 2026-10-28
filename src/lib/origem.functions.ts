/**
 * Regras de origem por mensagem: criar, ligar/desligar e remover.
 *
 * Só dono ou administrador (uma regra muda como TODOS os leads novos são
 * classificados), e a empresa vem sempre do vínculo do usuário no servidor.
 * Ler e aplicar passam pelo banco, que confere o papel por conta própria.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CANAIS_ATRIBUIVEIS } from "@/modules/analytics/lib/canais";
import { papelNaEmpresa, podeAdministrar } from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_REGRAS = 30;

async function empresaDoAdministrador(admin: any, userId: string): Promise<string> {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  if (!podeAdministrar(role))
    throw new Error("Apenas dono ou administrador pode gerenciar regras de origem.");
  return companyId;
}

export const criarRegraDeOrigem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        padrao: z.string().trim().min(2).max(80),
        canal: z.enum(CANAIS_ATRIBUIVEIS),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoAdministrador(admin, context.userId);

    const { count } = await admin
      .from("origin_rules")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) >= MAX_REGRAS) throw new Error(`Limite de ${MAX_REGRAS} regras.`);

    const { data: criada, error } = await admin
      .from("origin_rules")
      .insert({
        company_id: companyId,
        padrao: data.padrao,
        canal: data.canal,
        criada_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível criar a regra.");
    return { id: criada.id as string };
  });

export const alternarRegraDeOrigem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), ativa: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoAdministrador(admin, context.userId);

    const { data: r, error } = await admin
      .from("origin_rules")
      .update({ ativa: data.ativa })
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível atualizar a regra.");
    if (!r) throw new Error("Regra não encontrada.");
    return { ok: true as const };
  });

export const removerRegraDeOrigem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoAdministrador(admin, context.userId);

    const { data: r, error } = await admin
      .from("origin_rules")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível remover a regra.");
    if (!r) throw new Error("Regra não encontrada.");
    return { ok: true as const };
  });
