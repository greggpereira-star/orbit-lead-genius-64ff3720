/**
 * Plano da empresa para a tela. Somente leitura: o navegador não troca de plano.
 * A empresa vem do vínculo do usuário no servidor, nunca de um parâmetro.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { papelNaEmpresa } from "@/lib/whatsapp/papeis";

export interface PlanoDaEmpresa {
  plano: string;
  nome: string;
  status: "ativo" | "teste" | "suspenso";
  testeAte: string | null;
  recursos: Record<string, boolean | number | null>;
}

export const meuPlano = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanoDaEmpresa | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { companyId } = await papelNaEmpresa(admin, context.userId);

    const { data, error } = await admin.rpc("plano_da_empresa", { p_company_id: companyId });
    const linha = Array.isArray(data) ? data[0] : data;
    if (error || !linha) return null;
    return {
      plano: linha.plano,
      nome: linha.nome,
      status: linha.status,
      testeAte: linha.teste_ate ?? null,
      recursos: linha.recursos ?? {},
    };
  });
