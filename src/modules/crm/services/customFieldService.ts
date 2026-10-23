/**
 * Campos personalizados do lead: as definições da empresa e o valor de cada lead.
 * O valor passa por `definir_campo_do_lead` (valida pelo tipo e grava só aquele campo).
 */
import { supabase } from "@/integrations/supabase/client";
import type { DefinicaoDeCampo, TipoDeCampo } from "../lib/camposPersonalizados";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

export async function listarCampos(
  companyId: string,
  incluirInativos = false,
): Promise<DefinicaoDeCampo[]> {
  let q = db()
    .from("custom_field_defs")
    .select("id,key,label,type,options,position,active")
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!incluirInativos) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((d) => ({
    ...d,
    options: Array.isArray(d.options) ? d.options.map(String) : [],
  })) as DefinicaoDeCampo[];
}

export async function criarCampo(input: {
  companyId: string;
  key: string;
  label: string;
  type: TipoDeCampo;
  options: string[];
  position: number;
}): Promise<void> {
  const { error } = await db()
    .from("custom_field_defs")
    .insert({
      company_id: input.companyId,
      key: input.key,
      label: input.label.trim(),
      type: input.type,
      options: input.type === "select" ? input.options : [],
      position: input.position,
    });
  if (error) throw new Error(mensagemDoErro(error));
}

/** A chave e o tipo não mudam depois de criados: os valores já gravados e as regras dependem deles. */
export async function atualizarCampo(
  id: string,
  patch: { label?: string; options?: string[]; active?: boolean },
): Promise<void> {
  const { error } = await db().from("custom_field_defs").update(patch).eq("id", id);
  if (error) throw new Error(mensagemDoErro(error));
}

export async function valoresDoLead(leadId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("leads")
    .select("custom_fields")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.custom_fields ?? {}) as Record<string, unknown>) || {};
}

export async function definirCampoDoLead(
  leadId: string,
  key: string,
  valor: string,
): Promise<void> {
  const { error } = await db().rpc("definir_campo_do_lead", {
    p_lead_id: leadId,
    p_key: key,
    p_value: valor,
  });
  if (error) throw new Error(mensagemDoErro(error));
}

/** Mensagem legível: o banco responde `valor_invalido: Orçamento não é número`. */
export function mensagemDoErro(e: { message?: string; code?: string }): string {
  const m = e.message ?? "";
  if (e.code === "23505") return "Já existe um campo com essa chave.";
  if (m.includes("valor_invalido:")) return m.split("valor_invalido:")[1].trim();
  if (m.includes("campo_inexistente")) return "Esse campo não existe mais.";
  if (m.includes("lead_nao_encontrado")) return "Lead não encontrado.";
  if (m.includes("row-level security")) return "Você não tem permissão para isso.";
  return m || "Não deu certo.";
}
