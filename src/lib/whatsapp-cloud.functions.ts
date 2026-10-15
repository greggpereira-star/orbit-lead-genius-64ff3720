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
import type { NumeroOficial, TemplateOficial } from "@/lib/whatsapp/cloud/tipos";
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

    const [{ data: numeros, error: erroNumeros }, { data: templates }] = await Promise.all([
      admin
        .from("wa_phone_numbers")
        .select(
          "phone_number_id, display_phone, mode, quality, messaging_tier, is_on_biz_app, status, disconnected_at, disconnection_reason, webhook_subscribed_at, history_progress, coexistence_synced_at",
        )
        .eq("company_id", companyId),
      admin
        .from("wa_templates")
        .select("id, name, language, category, status, rejection_reason, quality, updated_at")
        .eq("company_id", companyId)
        .order("name"),
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
      numeros: (numeros ?? []) as NumeroOficial[],
      templates: (templates ?? []) as TemplateOficial[],
    };
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

    const { concluirOnboarding, sincronizarTemplates } =
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
    const t = await sincronizarTemplates(admin, companyId).catch(() => ({
      ok: false as const,
      texto: "",
    }));
    return { ...r, templates: t.ok ? t.total : null };
  });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const sincronizarTemplatesWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAtender(admin, context.userId);
    const { sincronizarTemplates } = await import("@/lib/whatsapp/cloud/onboarding");
    const r = await sincronizarTemplates(admin, companyId);
    if (!r.ok) throw new Error(r.texto);
    return r;
  });

const botaoSchema = z.object({
  tipo: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  texto: z.string().max(60),
  valor: z.string().max(2100).optional(),
});

export const criarTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        nome: z.string().max(512),
        idioma: z.string().max(10),
        categoria: z.enum(["MARKETING", "UTILITY"]),
        cabecalho: z.string().max(200).optional(),
        corpo: z.string().max(2000),
        rodape: z.string().max(200).optional(),
        botoes: z.array(botaoSchema).max(12).optional(),
        exemplosDoCorpo: z.array(z.string().max(200)).max(20).optional(),
        exemplosDoCabecalho: z.array(z.string().max(200)).max(2).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { criarTemplate } = await import("@/lib/whatsapp/cloud/onboarding");
    // Devolve o resultado (com `problemas`) em vez de lançar: a tela destaca cada campo.
    return criarTemplate(admin, { companyId, userId: context.userId, definicao: data });
  });

export const apagarTemplateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ nome: z.string().regex(/^[a-z0-9_]{1,512}$/) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const companyId = await empresaParaAdministrar(admin, context.userId);
    const { apagarTemplate } = await import("@/lib/whatsapp/cloud/onboarding");
    const r = await apagarTemplate(admin, { companyId, nome: data.nome });
    if (!r.ok) throw new Error(r.texto);
    return r;
  });
