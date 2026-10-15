/**
 * Server functions do atendimento WhatsApp.
 *
 * Leitura (lista, mensagens) é feita pelo navegador direto nas tabelas `wa_*`,
 * sob RLS — assim o realtime e a segurança por empresa são os do banco. Toda
 * ESCRITA passa por aqui, porque envia à Meta, valida regra de negócio (janela,
 * opt-out, atendente da própria empresa) e usa a chave de serviço.
 *
 * A conversa é sempre conferida contra a empresa da SESSÃO: o id que chega do
 * navegador é só um ponteiro, nunca uma autorização.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function empresaDoUsuario(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("memberships")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Usuário sem empresa.");
  return data.company_id as string;
}

/** Lança se a conversa não for da empresa do usuário. */
async function conferirConversa(admin: any, companyId: string, conversaId: string) {
  const { data } = await admin
    .from("wa_conversations")
    .select("id, company_id, status, assigned_to")
    .eq("id", conversaId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) throw new Error("Conversa não encontrada.");
  return data as { id: string; company_id: string; status: string; assigned_to: string | null };
}

const idConversa = z.string().uuid();

export const enviarMensagemWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ conversaId: idConversa, texto: z.string().min(1).max(4096) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const conv = await conferirConversa(admin, companyId, data.conversaId);

    const { enviarTextoNaConversa } = await import("@/lib/whatsapp/cloud/envio");
    const r = await enviarTextoNaConversa(admin, {
      conversaId: data.conversaId,
      texto: data.texto,
      enviadoPor: context.userId,
      origem: "agent",
    });

    // Quem responde assume a conversa quando ninguém a tinha: evita a fila
    // mostrar "sem dono" uma conversa que já está sendo atendida.
    if (r.ok && conv.assigned_to === null) {
      await admin
        .from("wa_conversations")
        .update({ assigned_to: context.userId })
        .eq("id", conv.id);
    }
    return r;
  });

export const enviarTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        nome: z.string().regex(/^[a-z0-9_]{1,512}$/),
        idioma: z.string().max(10),
        valores: z.record(z.string().regex(/^\d{1,2}$/), z.string().max(1024)).default({}),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const conv = await conferirConversa(admin, companyId, data.conversaId);

    const valores: Record<number, string> = {};
    for (const [k, v] of Object.entries(data.valores)) valores[Number(k)] = v;

    const { enviarTemplateNaConversa } = await import("@/lib/whatsapp/cloud/envio");
    const r = await enviarTemplateNaConversa(admin, {
      conversaId: data.conversaId,
      nome: data.nome,
      idioma: data.idioma,
      valores,
      enviadoPor: context.userId,
      origem: "agent",
    });
    if (r.ok && conv.assigned_to === null) {
      await admin
        .from("wa_conversations")
        .update({ assigned_to: context.userId })
        .eq("id", conv.id);
    }
    return r;
  });

export const atribuirConversaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ conversaId: idConversa, userId: z.string().uuid().nullable() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);

    // O destino precisa ser membro DESTA empresa — o RLS por si só aceitaria
    // qualquer uuid, e a conversa sumiria da fila de todo mundo.
    if (data.userId) {
      const { data: m } = await admin
        .from("memberships")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!m) throw new Error("Este atendente não pertence à empresa.");
    }

    const { error } = await admin
      .from("wa_conversations")
      .update({ assigned_to: data.userId })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const alterarStatusConversaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ conversaId: idConversa, status: z.enum(["open", "pending", "resolved"]) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { error } = await admin
      .from("wa_conversations")
      .update({ status: data.status })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listarAtendentesWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);

    const { data: membros } = await admin
      .from("memberships")
      .select("user_id")
      .eq("company_id", companyId);
    const ids = ((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    if (ids.length === 0) return [] as Array<{ id: string; nome: string }>;

    const { data: perfis } = await admin.from("profiles").select("id, full_name").in("id", ids);
    const nomes = new Map<string, string>(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name ?? "",
      ]),
    );
    return ids
      .map((id) => ({ id, nome: nomes.get(id)?.trim() || "Sem nome" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });
