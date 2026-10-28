import { supabase } from "@/integrations/supabase/client";
import { analisarComparativo, type Comparativo, type JanelaBruta } from "../lib/comparativo";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Atual e anterior calculados juntos, pela função do banco que confere o acesso à empresa. */
export async function comparativoDoPeriodo(companyId: string, dias: number): Promise<Comparativo> {
  const inicio = new Date(Date.now() - dias * 86400000);
  const { data, error } = await (supabase as any).rpc("comparativo_do_periodo", {
    p_company_id: companyId,
    p_desde: inicio.toISOString(),
    p_dias: dias,
  });
  if (error) throw new Error(error.message);
  return analisarComparativo((data ?? []) as JanelaBruta[], inicio, dias);
}
