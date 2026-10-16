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
import { instanceNameFor, nomeDaInstanciaConfere } from "@/lib/whatsapp/evolution-nome";
import {
  empresaDoUsuario,
  empresaParaAdministrar,
  empresaParaAtender,
} from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const companyId = await empresaParaAtender(admin, context.userId);
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
    const companyId = await empresaParaAtender(admin, context.userId);
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
    const companyId = await empresaParaAtender(admin, context.userId);
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
    const companyId = await empresaParaAtender(admin, context.userId);
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

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------
export const obterMidiaWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ mensagemId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);

    const { data: m } = await admin
      .from("wa_messages")
      .select("company_id, media_id")
      .eq("id", data.mensagemId)
      .maybeSingle();
    // Mensagem de outra empresa é "inexistente": não confirma que o id existe.
    if (!m || m.company_id !== companyId || !m.media_id) {
      return { ok: false as const, estado: "inexistente", texto: "Mídia não encontrada." };
    }

    const { urlDaMidia } = await import("@/lib/whatsapp/cloud/armazenamento");
    const r = await urlDaMidia(admin, companyId, m.media_id);
    return r.ok
      ? { ok: true as const, url: r.url, mime: r.mime, nome: r.nome, tipo: r.tipo }
      : { ok: false as const, estado: r.estado, texto: r.texto };
  });

export const prepararUploadDeMidiaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        nome: z.string().min(1).max(200),
        mime: z.string().min(3).max(100),
        bytes: z
          .number()
          .int()
          .positive()
          .max(200 * 1024 * 1024),
        forcarDocumento: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);

    const { classificarArquivoParaEnvio, caminhoDeSaida } =
      await import("@/lib/whatsapp/cloud/midia");
    const c = classificarArquivoParaEnvio({
      mime: data.mime,
      bytes: data.bytes,
      forcarDocumento: data.forcarDocumento,
    });
    if (!c.ok) return { ok: false as const, texto: c.texto };

    const caminho = caminhoDeSaida(companyId, data.nome, crypto.randomUUID());
    const { BUCKET } = await import("@/lib/whatsapp/cloud/armazenamento");
    const up = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho);
    if (up.error || !up.data)
      return { ok: false as const, texto: "Não consegui preparar o envio do arquivo." };
    return { ok: true as const, tipo: c.tipo, caminho, token: up.data.token as string };
  });

export const enviarMidiaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        caminho: z.string().min(10).max(300),
        tipo: z.enum(["image", "video", "audio", "document"]),
        mime: z.string().max(100),
        nome: z.string().min(1).max(200),
        legenda: z.string().max(1024).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    const conv = await conferirConversa(admin, companyId, data.conversaId);

    // O caminho vem do navegador: só vale se for da empresa DA SESSÃO.
    const { caminhoEhDaEmpresa } = await import("@/lib/whatsapp/cloud/midia");
    if (!caminhoEhDaEmpresa(data.caminho, companyId)) throw new Error("Arquivo inválido.");

    const { enviarMidiaNaConversa } = await import("@/lib/whatsapp/cloud/envio");
    const r = await enviarMidiaNaConversa(admin, {
      conversaId: data.conversaId,
      tipo: data.tipo,
      caminho: data.caminho,
      mime: data.mime,
      nomeDoArquivo: data.nome,
      legenda: data.legenda?.trim() || null,
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

// ---------------------------------------------------------------------------
// Notas internas
// ---------------------------------------------------------------------------
export const criarNotaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ conversaId: idConversa, texto: z.string().trim().min(1).max(4000) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { error } = await admin.from("wa_notes").insert({
      company_id: companyId,
      conversation_id: data.conversaId,
      author_id: context.userId,
      body: data.texto,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Corte da Evolution
// ---------------------------------------------------------------------------
async function coletarFatosDoCorte(admin: any, companyId: string) {
  const semana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const contar = async (q: any) => {
    const r = await q;
    return typeof r.count === "number" ? r.count : 0;
  };

  const [num, instancia, aprovados, settings, textoLivre, recebidas, entregues] = await Promise.all(
    [
      admin
        .from("wa_phone_numbers")
        .select("status, webhook_subscribed_at")
        .eq("company_id", companyId)
        .limit(1),
      admin
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("company_id", companyId)
        .maybeSingle(),
      contar(
        admin
          .from("wa_templates")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "APPROVED"),
      ),
      admin
        .from("whatsapp_automation_settings")
        .select("greeting_enabled, broker_alert_enabled")
        .eq("company_id", companyId)
        .maybeSingle(),
      contar(
        admin
          .from("automation_actions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("action_type", "enviar_whatsapp"),
      ),
      contar(
        admin
          .from("wa_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("direction", "inbound")
          .eq("origin", "customer")
          .gte("created_at", semana),
      ),
      contar(
        admin
          .from("wa_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("direction", "outbound")
          .in("status", ["delivered", "read"])
          .gte("created_at", semana),
      ),
    ],
  );

  const numero = (num.data ?? [])[0] as
    { status?: string; webhook_subscribed_at?: string | null } | undefined;
  const cfg = settings.data as {
    greeting_enabled?: boolean;
    broker_alert_enabled?: boolean;
  } | null;
  const lerEnv = (n: string) => Boolean(process.env[n]?.trim());

  return {
    fatos: {
      numeroAtivo: numero?.status === "active",
      webhookInscrito: Boolean(numero?.webhook_subscribed_at),
      recebidasNaSemana: recebidas,
      entreguesNaSemana: entregues,
      templatesAprovados: aprovados,
      legadoLigado: Boolean(cfg?.greeting_enabled || cfg?.broker_alert_enabled),
      regrasComTextoLivre: textoLivre,
      temInstanciaEvolution: nomeDaInstanciaConfere(companyId, instancia.data?.instance_name),
      ambienteCompleto: lerEnv("WA_TOKEN_KEY") && lerEnv("WA_WEBHOOK_VERIFY_TOKEN"),
    },
    // Recomputado: a Evolution tem uma chave só para todas as empresas.
    instanceName: nomeDaInstanciaConfere(companyId, instancia.data?.instance_name)
      ? instanceNameFor(companyId)
      : null,
  };
}

export const avaliarCorteWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const { fatos } = await coletarFatosDoCorte(admin, companyId);
    const { avaliarProntidaoDoCorte } = await import("@/lib/whatsapp/corte");
    return { ...avaliarProntidaoDoCorte(fatos), fatos };
  });

export const executarCorteEvolutionWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ confirmacao: z.string().max(100) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);

    const { avaliarProntidaoDoCorte, confirmacaoConfere } = await import("@/lib/whatsapp/corte");
    if (!confirmacaoConfere(data.confirmacao)) {
      throw new Error("Digite a frase de confirmação exatamente como mostrada.");
    }

    // Reavalia NO SERVIDOR, na hora: o que a tela mostrou pode ter mudado.
    const { fatos, instanceName } = await coletarFatosDoCorte(admin, companyId);
    const { pronto, itens } = avaliarProntidaoDoCorte(fatos);
    if (!pronto || !instanceName) {
      const faltam = itens.filter((i) => i.bloqueante && !i.ok).map((i) => i.texto);
      throw new Error(
        `O corte não está liberado: ${faltam.join("; ") || "não há instância para remover"}.`,
      );
    }

    // Primeiro desliga o que dispara; só então remove a sessão. Se a remoção
    // falhar, o desligamento é DESFEITO: antes a empresa ficava sem saudação nem
    // alerta e com a instância ainda viva — um estado que ninguém escolheu.
    const { data: antes } = await admin
      .from("whatsapp_automation_settings")
      .select("greeting_enabled, broker_alert_enabled")
      .eq("company_id", companyId)
      .maybeSingle();
    await admin
      .from("whatsapp_automation_settings")
      .update({ greeting_enabled: false, broker_alert_enabled: false })
      .eq("company_id", companyId);

    const { evolutionAdmin } = await import("@/lib/whatsapp/evolution-provider");
    const r = await evolutionAdmin.deleteInstance(instanceName);
    if (!r.ok) {
      if (antes) {
        await admin
          .from("whatsapp_automation_settings")
          .update({
            greeting_enabled: Boolean(antes.greeting_enabled),
            broker_alert_enabled: Boolean(antes.broker_alert_enabled),
          })
          .eq("company_id", companyId);
      }
      throw new Error(
        `Não consegui remover a instância da Evolution: ${r.error ?? "erro desconhecido"}`,
      );
    }

    await admin
      .from("whatsapp_instances")
      .update({
        status: "disconnected",
        last_error: "Cortada: empresa migrada para a API oficial",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Lida
// ---------------------------------------------------------------------------
/**
 * Zera as não lidas. Antes o navegador escrevia direto na tabela — o que dava a
 * qualquer membro (viewer incluído) UPDATE nas conversas pelo PostgREST. Agora a
 * escrita passa por aqui, onde o papel e a empresa são conferidos.
 */
export const marcarConversaComoLidaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversaId: idConversa }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { error } = await admin
      .from("wa_conversations")
      .update({ unread_agent: 0 })
      .eq("id", data.conversaId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * "Marcar como não lida": devolve a conversa à lista com o contador aceso.
 * Só sobe o contador quando ele está zerado — não apaga o que já era não lido.
 */
export const marcarConversaComoNaoLidaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversaId: idConversa }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { error } = await admin
      .from("wa_conversations")
      .update({ unread_agent: 1 })
      .eq("id", data.conversaId)
      .eq("company_id", companyId)
      .eq("unread_agent", 0);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
