import { supabase } from "@/integrations/supabase/client";
import type { RespostaBruta } from "../lib/resposta";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tempo de primeira resposta do período, pela função do banco que confere o acesso à empresa. */
export async function tempoDeResposta(companyId: string, dias: number): Promise<RespostaBruta> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc("tempo_de_resposta", {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  const linha = (Array.isArray(data) ? data[0] : data) as RespostaBruta | undefined;
  if (!linha) throw new Error("A função tempo_de_resposta não devolveu linha.");
  return linha;
}
