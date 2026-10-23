import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ConversaDaLista } from "../lib/conversas";
import type { MensagemDaConversa } from "../lib/mensagens";
import {
  esperaDaReconexao,
  intervaloDeReleitura,
  tempoReal,
  useSituacaoDoTempoReal,
} from "../lib/tempoReal";

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
  seguindo: (companyId: string, userId: string) => ["wa-seguindo", companyId, userId] as const,
  mencoes: (companyId: string, userId: string) => ["wa-mencoes", companyId, userId] as const,
};

export interface TemplateAprovado {
  id: string;
  name: string;
  language: string;
  category: string;
  components: Array<Record<string, unknown>>;
  /** Conta (WABA) a que o template pertence. */
  account_id?: string;
  /** Telefone do número dessa conta, para a lista dizer de qual é (vazio se não achou). */
  numero?: string | null;
}

export function useConversas(companyId: string | undefined) {
  const qc = useQueryClient();

  const { estado } = useSituacaoDoTempoReal();
  // Cada tentativa de reconexão cria um canal novo (o antigo, em erro, não volta sozinho).
  const [tentativa, setTentativa] = useState(0);

  const q = useQuery({
    queryKey: chaves.conversas(companyId ?? ""),
    enabled: Boolean(companyId),
    refetchInterval: intervaloDeReleitura(estado),
    queryFn: async (): Promise<ConversaDaLista[]> => {
      const { data, error } = await wa()
        .from("wa_conversations")
        .select(
          "id,status,assigned_to,department_id,last_message_at,last_message_preview,last_inbound_at,unread_agent,lead_id,origin,contact:wa_contacts(wa_id,profile_name,opted_out_at),lead:leads(id,name,email,stage_id,stage:stages(name,color,kind),tags:lead_tags(tag_name)),numero:wa_phone_numbers(receive_only)",
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
    let encerrado = false;
    let religar: ReturnType<typeof setTimeout> | undefined;
    const canal = wa()
      .channel(`wa-atendimento-${companyId}-${tentativa}`)
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
      .subscribe((status: string, err?: { message?: string }) => {
        if (encerrado) return;
        const { reconectar } = tempoReal.registrar(status, err?.message ?? null);
        if (status === "SUBSCRIBED") {
          // O que chegou enquanto estava fora do ar: relê tudo uma vez ao conectar.
          qc.invalidateQueries({ queryKey: ["wa-conversas"] });
          qc.invalidateQueries({ queryKey: ["wa-mensagens"] });
        }
        if (reconectar && !religar) {
          religar = setTimeout(
            () => setTentativa((n) => n + 1),
            esperaDaReconexao(tempoReal.ler().tentativas),
          );
        }
      });
    return () => {
      encerrado = true;
      if (religar) clearTimeout(religar);
      wa().removeChannel(canal);
    };
  }, [companyId, qc, tentativa]);

  return q;
}

export function useMensagens(conversaId: string | null) {
  const { estado } = useSituacaoDoTempoReal();
  return useQuery({
    queryKey: chaves.mensagens(conversaId ?? ""),
    enabled: Boolean(conversaId),
    refetchInterval: intervaloDeReleitura(estado),
    queryFn: async (): Promise<MensagemDaConversa[]> => {
      const { data, error } = await wa()
        .from("wa_messages")
        .select(
          "id,direction,origin,type,body,status,provider_ts,created_at,template_name,sent_by,error_title,media_id,reply_to,payload",
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
      const [{ data, error }, { data: numeros }] = await Promise.all([
        wa()
          .from("wa_templates")
          .select("id,name,language,category,components,account_id")
          .eq("company_id", companyId)
          .eq("status", "APPROVED")
          .order("name"),
        // Só para rotular: template é da CONTA, e com mais de um número a lista precisa dizer de qual.
        wa().from("wa_phone_numbers").select("account_id,display_phone").eq("company_id", companyId),
      ]);
      if (error) throw new Error(error.message);
      const telefone = new Map<string, string>();
      for (const n of (numeros ?? []) as Array<{ account_id: string; display_phone: string | null }>) {
        if (n.display_phone && !telefone.has(n.account_id)) telefone.set(n.account_id, n.display_phone);
      }
      return ((data ?? []) as TemplateAprovado[]).map((t) => ({
        ...t,
        numero: t.account_id ? (telefone.get(t.account_id) ?? null) : null,
      }));
    },
  });
}

export interface NotaInterna {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export function useNotas(conversaId: string | null) {
  return useQuery({
    queryKey: ["wa-notas", conversaId ?? ""],
    enabled: Boolean(conversaId),
    queryFn: async (): Promise<NotaInterna[]> => {
      const { data, error } = await wa()
        .from("wa_notes")
        .select("id,author_id,body,created_at")
        .eq("conversation_id", conversaId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as NotaInterna[];
    },
  });
}

/** Contagem de mensagens COBRÁVEIS por categoria no período (não é valor em reais). */
export async function usoPorCategoria(
  companyId: string,
  desde: Date,
  ate: Date,
): Promise<Array<{ categoria: string; cobravel: boolean; total: number }>> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        f: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("wa_uso_por_categoria", {
    p_company_id: companyId,
    p_desde: desde.toISOString(),
    p_ate: ate.toISOString(),
  });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<{ categoria: string; cobravel: boolean; total: number | string }>
  ).map((l) => ({
    categoria: l.categoria,
    cobravel: l.cobravel,
    total: Number(l.total),
  }));
}

/** Conversas que a pessoa segue. Pessoal por RLS: a consulta só devolve as dela. */
export function useSeguindo(companyId: string | undefined, userId: string | null) {
  return useQuery({
    queryKey: chaves.seguindo(companyId ?? "", userId ?? ""),
    enabled: Boolean(companyId && userId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await wa()
        .from("wa_conversation_followers")
        .select("conversation_id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .limit(1000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ conversation_id: string }>).map((l) => l.conversation_id);
    },
  });
}

/** Conversas em que a pessoa foi mencionada e ainda não leu. */
export function useMencoesNaoLidas(companyId: string | undefined, userId: string | null) {
  return useQuery({
    queryKey: chaves.mencoes(companyId ?? "", userId ?? ""),
    enabled: Boolean(companyId && userId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await wa()
        .from("wa_mentions")
        .select("conversation_id")
        .eq("company_id", companyId)
        .eq("mentioned_user_id", userId)
        .is("read_at", null)
        .limit(1000);
      if (error) throw new Error(error.message);
      return [
        ...new Set(
          ((data ?? []) as Array<{ conversation_id: string }>).map((l) => l.conversation_id),
        ),
      ];
    },
  });
}

export interface MensagemAgendada {
  id: string;
  body: string;
  send_at: string;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  result: string | null;
}

/** O que está programado (e o que falhou nas últimas 24 h) numa conversa. */
export function useAgendadas(conversaId: string | null) {
  return useQuery({
    queryKey: ["wa-agendadas", conversaId ?? ""],
    enabled: Boolean(conversaId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<MensagemAgendada[]> => {
      const { data, error } = await wa()
        .from("wa_scheduled_messages")
        .select("id,body,send_at,status,result")
        .eq("conversation_id", conversaId)
        .in("status", ["pending", "sending", "failed"])
        .gte("send_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order("send_at", { ascending: true })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as MensagemAgendada[];
    },
  });
}

export interface LeadDoPainel {
  id: string;
  company_id: string;
  stage_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  temperature: string | null;
  source: string | null;
  utm_campaign: string | null;
  created_at: string;
  stage: { name: string } | null;
  tags: Array<{ tag_name: string }>;
}

/** O que o CRM sabe do lead da conversa, para o painel lateral. Sob RLS. */
export function useLeadDoPainel(leadId: string | null) {
  return useQuery({
    queryKey: ["wa-lead-painel", leadId ?? ""],
    enabled: Boolean(leadId),
    staleTime: 30_000,
    queryFn: async (): Promise<LeadDoPainel | null> => {
      const { data, error } = await wa()
        .from("leads")
        .select(
          "id,company_id,stage_id,name,email,phone,score,temperature,source,utm_campaign,created_at,stage:stages(name),tags:lead_tags(tag_name)",
        )
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as LeadDoPainel | null;
    },
  });
}
