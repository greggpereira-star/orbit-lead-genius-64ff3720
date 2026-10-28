/**
 * Origem dos leads por canal e leads não rastreados.
 *
 * Toda leitura passa por funções do banco que conferem o acesso à empresa; a
 * classificação (`canal_do_lead`) mora lá, e a tela só mostra o que ela devolve.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CanalAtribuivel } from "../lib/canais";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

const desde = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

export interface LinhaDeCanal {
  canal: string;
  leads: number | string;
}

export interface LeadNaoRastreado {
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  stage_name: string | null;
  mensagens: string | null;
}

export interface RegraDeOrigem {
  id: string;
  padrao: string;
  canal: string;
  ativa: boolean;
  prioridade: number;
}

export async function origemDosLeads(companyId: string, dias: number): Promise<LinhaDeCanal[]> {
  const { data, error } = await db().rpc("origem_dos_leads", {
    p_company_id: companyId,
    p_desde: desde(dias),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaDeCanal[];
}

export async function leadsNaoRastreados(
  companyId: string,
  dias: number,
  limite = 50,
): Promise<LeadNaoRastreado[]> {
  const { data, error } = await db().rpc("leads_nao_rastreados", {
    p_company_id: companyId,
    p_desde: desde(dias),
    p_limite: limite,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadNaoRastreado[];
}

export async function definirOrigemDoLead(
  leadId: string,
  canal: CanalAtribuivel | null,
): Promise<void> {
  const { error } = await db().rpc("definir_origem_do_lead", { p_lead_id: leadId, p_canal: canal });
  if (error) throw new Error(error.message);
}

export async function aplicarRegrasDeOrigem(companyId: string): Promise<number> {
  const { data, error } = await db().rpc("aplicar_regras_de_origem", { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function listarRegrasDeOrigem(companyId: string): Promise<RegraDeOrigem[]> {
  const { data, error } = await db()
    .from("origin_rules")
    .select("id, padrao, canal, ativa, prioridade")
    .eq("company_id", companyId)
    .order("prioridade", { ascending: true })
    .order("criada_em", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RegraDeOrigem[];
}
