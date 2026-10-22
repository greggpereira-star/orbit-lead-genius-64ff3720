/**
 * Server functions do WhatsApp oficial (Cloud API) — conexão e templates.
 *
 * Módulo client-safe: os imports de servidor ficam dentro dos `.handler()`.
 * A empresa vem SEMPRE da sessão (membership); nada que o navegador mande
 * escolhe a empresa. Tokens nunca saem daqui: o retorno é só estado.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  NumeroOficial,
  RascunhoDeTemplate,
  TemplateOficial,
} from "@/lib/whatsapp/cloud/tipos";
import {
  empresaDoUsuario,
  empresaParaAdministrar,
  empresaParaAtender,
} from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
const lerEnv = (nome: string): string | undefined =>
  process.env[nome]?.trim().replace(/^['"]|['"]$/g, "") || undefined;

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
export const obterEstadoDoWhatsAppOficial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);

    const [
      { data: numeros, error: erroNumeros },
      { data: templates },
      { data: instancias },
      { data: rascunhos },
    ] = await Promise.all([
      admin
        .from("wa_phone_numbers")
        .select(
          "account_id, phone_number_id, display_phone, mode, quality, messaging_tier, is_on_biz_app, status, disconnected_at, disconnection_reason, webhook_subscribed_at, history_progress, coexistence_synced_at, receive_only",
        )
        .eq("company_id", companyId),
      admin
        .from("wa_templates")
        .select(
          "id, account_id, name, language, category, status, rejection_reason, quality, updated_at",
        )
        .eq("company_id", companyId)
        .order("name"),
      // Só o banco: perguntar à Evolution aqui derruba a tela quando ela está fora.
      admin.from("whatsapp_instances").select("status").eq("company_id", companyId),
      // Sem a tabela (migração pendente) volta vazio: a tela segue funcionando.
      admin
        .from("wa_template_drafts")
        .select("id, name, definition, updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    return {
      // `migracaoAplicada: false` quando as tabelas ainda não existem — a tela
      // diz isso em vez de parecer "sem número conectado".
      migracaoAplicada: !erroNumeros,
      ambiente: {
        appId: lerEnv("META_APP_ID") ?? null,
        configId: lerEnv("WA_ES_CONFIG_ID") ?? null,
        temSegredoDoApp: Boolean(lerEnv("META_APP_SECRET")),
        temChaveDeCifra: Boolean(lerEnv("WA_TOKEN_KEY")),
        temTokenDeVerificacao: Boolean(lerEnv("WA_WEBHOOK_VERIFY_TOKEN")),
      },
      evolutionConectada: ((instancias ?? []) as Array<{ status: string }>).some(
        (i) => i.status === "connected",
      ),
      numeros: (numeros ?? []) as NumeroOficial[],
      templates: (templates ?? []) as TemplateOficial[],
      rascunhos: (rascunhos ?? []) as RascunhoDeTemplate[],
    };
  });

/**
 * Situação de cada número NA META. Separada do estado da tela de propósito: é uma chamada
 * externa por conta, que pode demorar ou falhar, e a tela não pode esperar por ela.
 */
export const obterSituacaoDosNumerosWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const { lerSituacaoDosNumeros } = await import("@/lib/whatsapp/cloud/onboarding");
    return lerSituacaoDosNumeros(admin, companyId);
  });

// ---------------------------------------------------------------------------
// Conexões (lista única: API oficial + QR code)
// ---------------------------------------------------------------------------
export const listarConexoesWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { montarConexoes } = await import("@/lib/whatsapp/cloud/conexoes");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const [{ data: numeros }, { data: instancias }] = await Promise.all([
      admin
        .from("wa_phone_numbers")
        .select(
          "phone_number_id, display_phone, mode, status, receive_only, webhook_subscribed_at, disconnection_reason, created_at, account:wa_accounts(waba_id, display_name)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      // Só o banco: perguntar à Evolution aqui derrubaria a tela quando ela está fora.
      admin
        .from("whatsapp_instances")
        .select("id, status, phone_number, last_connected_at, last_error, created_at")
        .eq("company_id", companyId),
    ]);
    return montarConexoes({ numeros: numeros ?? [], instancias: instancias ?? [] });
  });

/** Saúde de uma conexão oficial na Meta. Devolve o erro em vez de lançar: a tela mostra "indisponível". */
export const obterSaudeDaConexaoWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ phoneNumberId: z.string().regex(/^\d{5,30}$/) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaDoUsuario(admin, context.userId);
    const { lerSaudeDaConexao } = await import("@/lib/whatsapp/cloud/onboarding");
    return lerSaudeDaConexao(admin, companyId, data.phoneNumberId);
  });

// ---------------------------------------------------------------------------
// Concluir o Embedded Signup
// ---------------------------------------------------------------------------
export const concluirSignupWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        code: z.string().min(10).max(2048),
        wabaId: z.string().regex(/^\d{5,30}$/),
        phoneNumberId: z.string().regex(/^\d{5,30}$/),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const appId = lerEnv("META_APP_ID");
    const appSecret = lerEnv("META_APP_SECRET");
    if (!appId || !appSecret)
      throw new Error("META_APP_ID / META_APP_SECRET não configurados no servidor.");
    if (!lerEnv("WA_TOKEN_KEY")) throw new Error("WA_TOKEN_KEY não configurada no servidor.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);

    const { concluirOnboarding, contaIdDoNumero, sincronizarTemplates } =
      await import("@/lib/whatsapp/cloud/onboarding");
    const r = await concluirOnboarding(admin, {
      appId,
      appSecret,
      companyId,
      userId: context.userId,
      code: data.code,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
    });
    if (!r.ok) throw new Error(r.texto);

    // Melhor esforço: a conexão já valeu, template pode ser sincronizado depois.
    // Da conta do número que acabou de conectar: com mais de um número, "a da empresa" não existe.
    const t = await contaIdDoNumero(admin, companyId, data.phoneNumberId)
      .then((accountId) => sincronizarTemplates(admin, companyId, accountId))
      .catch(() => ({
      ok: false as const,
      texto: "",
    }));
    return { ...r, templates: t.ok ? t.total : null };
  });

// ---------------------------------------------------------------------------
// Conexão manual (número de teste da Meta / quem já tem WABA e token)
// ---------------------------------------------------------------------------
/**
 * O token é colado por quem administra a empresa e vale como prova de acesso:
 * a Meta o valida ao ler o número. Não passa por log nem volta na resposta.
 */
export const conectarNumeroManualWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        wabaId: z
          .string()
          .trim()
          .regex(/^\d{5,30}$/, "ID da conta inválido."),
        phoneNumberId: z
          .string()
          .trim()
          .regex(/^\d{5,30}$/, "ID do número inválido."),
        token: z.string().trim().min(20).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    if (!lerEnv("WA_TOKEN_KEY")) throw new Error("WA_TOKEN_KEY não configurada no servidor.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);

    const { concluirComToken, contaIdDoNumero, sincronizarTemplates } =
      await import("@/lib/whatsapp/cloud/onboarding");
    const r = await concluirComToken(admin, {
      companyId,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      token: data.token,
    });
    if (!r.ok) throw new Error(r.texto);

    const t = await contaIdDoNumero(admin, companyId, data.phoneNumberId)
      .then((accountId) => sincronizarTemplates(admin, companyId, accountId))
      .catch(() => ({
        ok: false as const,
        texto: "",
      }));
    return { ...r, templates: t.ok ? t.total : null };
  });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
/** `accountId` = a conta (WABA) cujos templates se quer. Opcional só quando há uma conta. */
const contaDoTemplateSchema = z.object({ accountId: z.string().uuid().optional() });

export const sincronizarTemplatesWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => contaDoTemplateSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    const { sincronizarTemplates } = await import("@/lib/whatsapp/cloud/onboarding");
    const r = await sincronizarTemplates(admin, companyId, data.accountId);
    if (!r.ok) throw new Error(r.texto);
    return r;
  });

const botaoSchema = z.object({
  tipo: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  texto: z.string().max(60),
  valor: z.string().max(2100).optional(),
});

/** Forma de um template (a mesma para rascunho e para envio à Meta). */
const definicaoSchema = z.object({
  nome: z.string().max(512),
  idioma: z.string().max(10),
  categoria: z.enum(["MARKETING", "UTILITY"]),
  cabecalho: z.string().max(200).optional(),
  corpo: z.string().max(2000),
  rodape: z.string().max(200).optional(),
  botoes: z.array(botaoSchema).max(12).optional(),
  exemplosDoCorpo: z.array(z.string().max(200)).max(20).optional(),
  exemplosDoCabecalho: z.array(z.string().max(200)).max(2).optional(),
});

export const criarTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    definicaoSchema
      .extend({ rascunhoId: z.string().uuid().optional(), accountId: z.string().uuid().optional() })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { criarTemplate } = await import("@/lib/whatsapp/cloud/onboarding");
    const { rascunhoId, accountId, ...definicao } = data;
    // Devolve o resultado (com `problemas`) em vez de lançar: a tela destaca cada campo.
    const r = await criarTemplate(admin, {
      companyId,
      userId: context.userId,
      definicao,
      accountId,
    });
    // Foi para a Meta: o rascunho cumpriu o papel. Só some se a criação deu certo.
    if (r.ok && rascunhoId) {
      await admin
        .from("wa_template_drafts")
        .delete()
        .eq("id", rascunhoId)
        .eq("company_id", companyId);
    }
    return r;
  });

const TETO_DE_RASCUNHOS = 50;

export const salvarRascunhoTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid().optional(), definicao: definicaoSchema }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const agora = new Date().toISOString();

    if (data.id) {
      // Atualiza só o que é DESTA empresa (o id vem do navegador).
      const { data: linhas, error } = await admin
        .from("wa_template_drafts")
        .update({
          name: data.definicao.nome,
          definition: data.definicao,
          updated_by: context.userId,
          updated_at: agora,
        })
        .eq("id", data.id)
        .eq("company_id", companyId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!linhas?.length) throw new Error("Rascunho não encontrado.");
      return { ok: true as const, id: data.id as string };
    }

    const { count } = await admin
      .from("wa_template_drafts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) >= TETO_DE_RASCUNHOS)
      throw new Error(`Limite de ${TETO_DE_RASCUNHOS} rascunhos. Apague algum para salvar outro.`);

    const { data: nova, error } = await admin
      .from("wa_template_drafts")
      .insert({
        company_id: companyId,
        name: data.definicao.nome,
        definition: data.definicao,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !nova) throw new Error(error?.message ?? "Não foi possível salvar o rascunho.");
    return { ok: true as const, id: nova.id as string };
  });

export const apagarRascunhoTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { error } = await admin
      .from("wa_template_drafts")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Liga/desliga "apenas receptivo" num número DA empresa. */
export const definirApenasReceptivoWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ phoneNumberId: z.string().regex(/^\d{5,30}$/), valor: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { data: linhas, error } = await admin
      .from("wa_phone_numbers")
      .update({ receive_only: data.valor })
      .eq("phone_number_id", data.phoneNumberId)
      .eq("company_id", companyId)
      .select("phone_number_id");
    if (error) throw new Error(error.message);
    if (!linhas?.length) throw new Error("Número não encontrado.");
    return { ok: true as const, valor: data.valor };
  });

export const apagarTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ nome: z.string().regex(/^[a-z0-9_]{1,512}$/), accountId: z.string().uuid().optional() })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { apagarTemplate } = await import("@/lib/whatsapp/cloud/onboarding");
    const r = await apagarTemplate(admin, {
      companyId,
      nome: data.nome,
      accountId: data.accountId,
    });
    if (!r.ok) throw new Error(r.texto);
    return r;
  });

// ---------------------------------------------------------------------------
// Avisos da Meta (eventos da conta que o sistema não trata sozinho)
// ---------------------------------------------------------------------------
export const listarAvisosDaMetaWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { montarAvisos } = await import("@/lib/whatsapp/cloud/avisos");
    const admin = supabaseAdmin as any;
    // Só dono e administrador: o aviso fala de risco da conta e do canal.
    const companyId = await empresaParaAdministrar(admin, context.userId);

    const [{ data: contas }, { data: numeros }] = await Promise.all([
      admin.from("wa_accounts").select("waba_id").eq("company_id", companyId),
      admin.from("wa_phone_numbers").select("phone_number_id").eq("company_id", companyId),
    ]);
    const wabas = ((contas ?? []) as Array<{ waba_id: string }>).map((c) => c.waba_id);
    const ids = ((numeros ?? []) as Array<{ phone_number_id: string }>).map((n) => n.phone_number_id);
    if (wabas.length === 0 && ids.length === 0) return [];

    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: eventos } = await admin
      .from("wa_webhook_events")
      .select("id, field, received_at, phone_number_id, payload")
      .in("field", ["conta", "ignorado"])
      .gte("received_at", desde)
      .order("received_at", { ascending: false })
      .limit(300);
    return montarAvisos((eventos ?? []) as any[], { wabas, numeros: ids });
  });
