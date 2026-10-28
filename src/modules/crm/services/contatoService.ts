import { supabase } from "@/integrations/supabase/client";
import type { CanalDeContato, ContatoRegistrado } from "../lib/contatos";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Contatos feitos fora do sistema, registrados à mão. A tabela é só de acréscimo e a gravação
 * passa pela função `registrar_contato`, que confere o papel e fixa autor e horário no servidor.
 */
export async function registrarContato(
  leadId: string,
  canal: CanalDeContato,
): Promise<ContatoRegistrado & { repetido: boolean }> {
  const { data, error } = await (supabase as any).rpc("registrar_contato", {
    p_lead_id: leadId,
    p_canal: canal,
  });
  if (error) throw new Error(error.message);
  const linha = (Array.isArray(data) ? data[0] : data) as
    | (ContatoRegistrado & { repetido: boolean })
    | undefined;
  if (!linha) throw new Error("A função registrar_contato não devolveu o registro.");
  return linha;
}

export async function ultimoContato(leadId: string): Promise<ContatoRegistrado | null> {
  const { data, error } = await (supabase as any)
    .from("lead_contacts")
    .select("id, canal, author_name, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ContatoRegistrado | null;
}
