import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ConversaDaLista } from "../lib/conversas";
import type { MensagemDaConversa } from "../lib/mensagens";

/**
 * Leitura do atendimento direto nas tabelas `wa_*`, sob RLS.
 *
 * O cliente tipado não conhece as tabelas novas (os tipos gerados são
 * anteriores à migração); o cast fica concentrado neste arquivo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const wa = () =>
  supabase as unknown as {
    from: (t: string) => any;
    channel: (n: string) => any;
    removeChannel: (c: any) => void;
  };

export const chaves = {
  conversas: (companyId: string) => ["wa-conversas", companyId] as const,
  mensagens: (conversaId: string) => ["wa-mensagens", conversaId] as const,
  templates: (companyId: string) => ["wa-templates-aprovados", companyId] as const,
  atendentes: ["wa-atendentes"] as const,
};

export interface TemplateAprovado {
  id: string;
  name: string;
  language: string;
  category: string;
  components: Array<Record<string, unknown>>;
}

export function useConversas(companyId: string | undefined) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: chaves.conversas(companyId ?? ""),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<ConversaDaLista[]> => {
      const { data, error } = await wa()
        .from("wa_conversations")
        .select(
          "id,status,assigned_to,department_id,last_message_at,last_message_preview,last_inbound_at,unread_agent,lead_id,origin,contact:wa_contacts(wa_id,profile_name,opted_out_at),lead:leads(id,name,email)",
        )
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as ConversaDaLista[];
    },
  });

  // Tempo real: qualquer mudança nas conversas ou mensagens da empresa
  // invalida as consultas. O RLS decide o que este usuário recebe.
  useEffect(() => {
    if (!companyId) return;
    const canal = wa()
      .channel(`wa-atendimento-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_conversations",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: chaves.conversas(companyId) });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (p: { new?: { conversation_id?: string }; old?: { conversation_id?: string } }) => {
          const id = p.new?.conversation_id ?? p.old?.conversation_id;
          if (id) qc.invalidateQueries({ queryKey: chaves.mensagens(id) });
          qc.invalidateQueries({ queryKey: chaves.conversas(companyId) });
        },
      )
      .subscribe();
    return () => {
      wa().removeChannel(canal);
    };
  }, [companyId, qc]);

  return q;
}

export function useMensagens(conversaId: string | null) {
  return useQuery({
    queryKey: chaves.mensagens(conversaId ?? ""),
    enabled: Boolean(conversaId),
    queryFn: async (): Promise<MensagemDaConversa[]> => {
      const { data, error } = await wa()
        .from("wa_messages")
        .select(
          "id,direction,origin,type,body,status,provider_ts,created_at,template_name,sent_by,error_title",
        )
        .eq("conversation_id", conversaId)
        .order("provider_ts", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as MensagemDaConversa[];
    },
  });
}

export function useTemplatesAprovados(companyId: string | undefined) {
  return useQuery({
    queryKey: chaves.templates(companyId ?? ""),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<TemplateAprovado[]> => {
      const { data, error } = await wa()
        .from("wa_templates")
        .select("id,name,language,category,components")
        .eq("company_id", companyId)
        .eq("status", "APPROVED")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as TemplateAprovado[];
    },
  });
}

/** Zera as não lidas. Escrita simples, permitida pelo GRANT de coluna. */
export async function marcarComoLida(conversaId: string): Promise<void> {
  const { error } = await wa()
    .from("wa_conversations")
    .update({ unread_agent: 0 })
    .eq("id", conversaId);
  if (error) throw new Error(error.message);
}
