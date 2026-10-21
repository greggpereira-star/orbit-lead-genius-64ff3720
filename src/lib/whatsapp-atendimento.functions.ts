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
  podeAtender,
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

/** Segue a conversa para a pessoa. Idempotente (a chave é conversa + pessoa). */
async function seguir(admin: any, companyId: string, conversaId: string, userId: string) {
  await admin
    .from("wa_conversation_followers")
    .upsert(
      { conversation_id: conversaId, user_id: userId, company_id: companyId },
      { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
    );
}

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
        .select("user_id, role")
        .eq("company_id", companyId)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!m) throw new Error("Este atendente não pertence à empresa.");
      // Quem só lê não pode ser responsável: a conversa ficaria sem ninguém que responda.
      if (!podeAtender(String(m.role)))
        throw new Error("Este usuário tem acesso somente leitura e não pode ser responsável.");
    }

    const { error } = await admin
      .from("wa_conversations")
      .update({ assigned_to: data.userId })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    // Quem recebe a conversa passa a acompanhá-la (some do "Seguindo" só se deixar de seguir).
    if (data.userId) await seguir(admin, companyId, data.conversaId, data.userId).catch(() => {});
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

    // Quem só lê (visualizador) não pode ser responsável por conversa nem receber menção útil.
    const { data: membros } = await admin
      .from("memberships")
      .select("user_id, role")
      .eq("company_id", companyId);
    const ids = ((membros ?? []) as Array<{ user_id: string; role: string }>)
      .filter((m) => podeAtender(String(m.role)))
      .map((m) => m.user_id);
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
// Lead a partir da conversa
// ---------------------------------------------------------------------------
/**
 * Cria o lead do contato da conversa e já liga os dois. Devolve `duplicado` (em vez de
 * lançar) quando o telefone já é de um lead: a tela oferece ligar a ele.
 */
export const criarLeadDaConversaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        nome: z.string().trim().max(200).optional(),
        email: z.string().trim().max(254).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    const { criarLeadDaConversa } = await import("@/lib/whatsapp/cloud/leadDaConversa");
    return criarLeadDaConversa(admin, {
      companyId,
      userId: context.userId,
      conversaId: data.conversaId,
      nome: data.nome,
      email: data.email,
    });
  });

/** Liga a conversa a um lead que já existe (só quando o telefone do lead é o do contato). */
export const vincularConversaAoLeadWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ conversaId: idConversa, leadId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    const { vincularConversaAoLead } = await import("@/lib/whatsapp/cloud/leadDaConversa");
    return vincularConversaAoLead(admin, {
      companyId,
      userId: context.userId,
      conversaId: data.conversaId,
      leadId: data.leadId,
    });
  });

// ---------------------------------------------------------------------------
// Notas internas
// ---------------------------------------------------------------------------
export const criarNotaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        texto: z.string().trim().min(1).max(4000),
        mencionar: z.array(z.string().uuid()).max(10).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { data: nota, error } = await admin
      .from("wa_notes")
      .insert({
        company_id: companyId,
        conversation_id: data.conversaId,
        author_id: context.userId,
        body: data.texto,
      })
      .select("id")
      .single();
    if (error || !nota) throw new Error(error?.message ?? "Não foi possível salvar a nota.");

    // Menção só vale para quem é membro DESTA empresa (e não para si mesmo).
    const alvos = [...new Set(data.mencionar ?? [])].filter((id) => id !== context.userId);
    if (alvos.length > 0) {
      const { data: membros } = await admin
        .from("memberships")
        .select("user_id")
        .eq("company_id", companyId)
        .in("user_id", alvos);
      const validos = ((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      if (validos.length > 0) {
        await admin.from("wa_mentions").insert(
          validos.map((uid) => ({
            company_id: companyId,
            conversation_id: data.conversaId,
            note_id: nota.id,
            mentioned_user_id: uid,
            author_id: context.userId,
          })),
        );
        // Quem é mencionado passa a seguir a conversa.
        await Promise.all(
          validos.map((uid) => seguir(admin, companyId, data.conversaId, uid).catch(() => {})),
        );
      }
    }
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

// ---------------------------------------------------------------------------
// Seguir conversa e menções
// ---------------------------------------------------------------------------
export const seguirConversaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ conversaId: idConversa, seguir: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    if (data.seguir) {
      await seguir(admin, companyId, data.conversaId, context.userId);
    } else {
      const { error } = await admin
        .from("wa_conversation_followers")
        .delete()
        .eq("conversation_id", data.conversaId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Abrir a conversa lê as menções que a pessoa tinha nela. */
export const marcarMencoesComoLidasWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversaId: idConversa }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);
    const { error } = await admin
      .from("wa_mentions")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversaId)
      .eq("mentioned_user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Mensagens agendadas
// ---------------------------------------------------------------------------
export const agendarMensagemWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        conversaId: idConversa,
        texto: z.string().trim().min(1).max(4096),
        enviarEm: z.string().min(10).max(40),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);

    const { validarHorario, LIMITES_DO_AGENDAMENTO } =
      await import("@/lib/whatsapp/cloud/agendadas");
    const h = validarHorario(data.enviarEm);
    if (!h.ok) throw new Error(h.texto);

    // Teto por conversa: agendar não pode virar fila de disparo em massa.
    const { count } = await admin
      .from("wa_scheduled_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", data.conversaId)
      .eq("status", "pending");
    if ((count ?? 0) >= LIMITES_DO_AGENDAMENTO.pendentesPorConversa)
      throw new Error(
        `Esta conversa já tem ${LIMITES_DO_AGENDAMENTO.pendentesPorConversa} mensagens agendadas.`,
      );

    const { data: linha, error } = await admin
      .from("wa_scheduled_messages")
      .insert({
        company_id: companyId,
        conversation_id: data.conversaId,
        body: data.texto,
        send_at: h.iso,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !linha) throw new Error(error?.message ?? "Não foi possível agendar.");
    return { ok: true as const, id: linha.id as string, enviarEm: h.iso };
  });

export const cancelarMensagemAgendadaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    // Só cancela o que ainda não saiu, e só da própria empresa.
    const { data: linhas, error } = await admin
      .from("wa_scheduled_messages")
      .update({ status: "canceled", finished_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", companyId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    if (!linhas?.length) throw new Error("Esta mensagem já foi enviada ou cancelada.");
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Exportar conversa
// ---------------------------------------------------------------------------
const TETO_DA_EXPORTACAO = 5000;

/** CSV da conversa (mensagens; as notas internas NÃO entram). */
export const exportarConversaWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversaId: idConversa }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    await conferirConversa(admin, companyId, data.conversaId);

    const { data: msgs, error } = await admin
      .from("wa_messages")
      .select(
        "id,direction,origin,type,body,status,provider_ts,created_at,template_name,sent_by,error_title,media_id",
      )
      .eq("conversation_id", data.conversaId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(TETO_DA_EXPORTACAO);
    if (error) throw new Error(error.message);

    const ids = [
      ...new Set(
        ((msgs ?? []) as Array<{ sent_by: string | null }>)
          .map((m) => m.sent_by)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: perfis } = await admin.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (perfis ?? []) as Array<{ id: string; full_name: string | null }>)
        nomes.set(p.id, p.full_name?.trim() ?? "");
    }

    const { conversaParaCsv } = await import("@/lib/whatsapp/exportarConversa");
    const csv = conversaParaCsv(msgs ?? [], (uid) => (uid ? (nomes.get(uid) ?? "") : ""));
    return {
      ok: true as const,
      csv,
      total: (msgs ?? []).length,
      truncado: (msgs ?? []).length >= TETO_DA_EXPORTACAO,
    };
  });
