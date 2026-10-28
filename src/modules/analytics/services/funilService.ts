import { supabase } from "@/integrations/supabase/client";
import type { EtapaDoFunil } from "../lib/funil";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Funil do período (uma linha por etapa), pela função do banco que confere o acesso à empresa. */
export async function funilDoPeriodo(companyId: string, dias: number): Promise<EtapaDoFunil[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc("funil_do_periodo", {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    stage_id: String(r.stage_id),
    nome: String(r.nome),
    kind: String(r.kind),
    ordem: Number(r.ordem ?? 0),
    leads: Number(r.leads ?? 0),
    valor: Number(r.valor ?? 0),
    parados_24h: Number(r.parados_24h ?? 0),
    horas_medias:
      r.horas_medias === null || r.horas_medias === undefined ? null : Number(r.horas_medias),
  }));
}
