/**
 * Meta OAuth server functions (v25) — client-safe module (handlers strip server-only imports).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const META_API_VERSION = "v25.0";
const META_OAUTH_DIALOG = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const DEFAULT_PUBLIC_ORIGIN = "https://altleadflow.com.br";
const META_SCOPES = [
  "email",
  "public_profile",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "leads_retrieval",
].join(",");

function getPublicUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_APP_URL ??
    DEFAULT_PUBLIC_ORIGIN
  );
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function getAllowedOrigins(): Set<string> {
  const configuredOrigins = (readEnv("META_OAUTH_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    [
      getPublicUrl(),
      DEFAULT_PUBLIC_ORIGIN,
      "https://www.altleadflow.com.br",
      "https://altleadflow.com.br",
      "https://orbit-lead-genius.lovable.app",
      "https://id-preview--5d4053e9-e197-4195-8f1f-86c12b809081.lovable.app",
      "http://localhost:8080",
      ...configuredOrigins,
    ].map(normalizeOrigin),
  );
}

function resolveOAuthOrigin(origin?: string): string {
  const fallback = normalizeOrigin(getPublicUrl());
  if (!origin) return fallback;

  const normalized = normalizeOrigin(origin);
  if (!getAllowedOrigins().has(normalized)) return fallback;
  return normalized;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  return value || undefined;
}

function readMetaAppId(): string {
  const appId = readEnv("META_APP_ID");
  if (!appId) throw new Error("META_APP_ID não configurado. Adicione o secret no backend.");
  if (!/^\d+$/.test(appId)) {
    throw new Error("META_APP_ID inválido. Use apenas o ID numérico do app Meta, sem aspas ou URL.");
  }
  return appId;
}

// --------- START OAUTH ---------

export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ origin: z.string().url().optional() })
      .optional()
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { createHmac, randomBytes } = await import("node:crypto");
    const appId = readMetaAppId();
    const stateSecret = readEnv("META_OAUTH_STATE_SECRET");
    if (!stateSecret) throw new Error("META_OAUTH_STATE_SECRET ausente.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("memberships")
      .select("company_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.company_id) throw new Error("Usuário sem empresa vinculada.");

    const nonce = randomBytes(16).toString("hex");
    const issuedAt = Date.now();
    const origin = resolveOAuthOrigin(data?.origin);
    const originToken = Buffer.from(origin).toString("base64url");
    const payload = `${context.userId}.${mem.company_id}.${nonce}.${issuedAt}.${originToken}`;
    const sig = createHmac("sha256", stateSecret).update(payload).digest("hex");
    const state = Buffer.from(`${payload}.${sig}`).toString("base64url");

    const redirectUri = `${origin}/integrations/meta/callback`;
    console.info("[meta-oauth] starting", {
      requestedOrigin: data?.origin ?? null,
      resolvedOrigin: origin,
      redirectUri,
      userId: context.userId,
      companyId: mem.company_id,
    });
    const url = new URL(META_OAUTH_DIALOG);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", META_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("auth_type", "rerequest");

    return { authorizeUrl: url.toString(), redirectUri };
  });

// --------- COMPLETE OAUTH ---------

export const completeMetaOAuth = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(raw))
  .handler(async ({ data }) => {
    const { createHmac } = await import("node:crypto");
    const stateSecret = readEnv("META_OAUTH_STATE_SECRET");
    const appId = readMetaAppId();
    const appSecret = readEnv("META_APP_SECRET");
    if (!stateSecret || !appSecret) throw new Error("Credenciais Meta ausentes no backend.");

    // Verify state
    let decoded = "";
    try {
      decoded = Buffer.from(data.state, "base64url").toString("utf8");
    } catch {
      throw new Error("State inválido.");
    }
    const parts = decoded.split(".");
    if (parts.length !== 5 && parts.length !== 6) throw new Error("State malformado.");
    const [userId, companyId, nonce, issuedAtStr] = parts;
    const originToken = parts.length === 6 ? parts[4] : Buffer.from(getPublicUrl()).toString("base64url");
    const sig = parts.length === 6 ? parts[5] : parts[4];
    const payload = parts.length === 6
      ? `${userId}.${companyId}.${nonce}.${issuedAtStr}.${originToken}`
      : `${userId}.${companyId}.${nonce}.${issuedAtStr}`;
    const expected = createHmac("sha256", stateSecret).update(payload).digest("hex");
    if (expected !== sig) throw new Error("Assinatura de state inválida.");
    if (Date.now() - Number(issuedAtStr) > 10 * 60 * 1000) throw new Error("State expirado. Tente conectar novamente.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!membership) throw new Error("Vínculo do usuário com a empresa não encontrado.");

    const { exchangeCodeForToken, exchangeForLongLivedToken, getMe, listUserPages } = await import(
      "@/lib/meta-graph.server"
    );

    const origin = resolveOAuthOrigin(Buffer.from(originToken, "base64url").toString("utf8"));
    const redirectUri = `${origin}/integrations/meta/callback`;
    console.info("[meta-oauth] completing", {
      resolvedOrigin: origin,
      redirectUri,
      userId,
      companyId,
    });
    const shortLived = await exchangeCodeForToken({ appId, appSecret, redirectUri, code: data.code });
    const longLived = await exchangeForLongLivedToken({
      appId,
      appSecret,
      shortLivedToken: shortLived.access_token,
    });
    const me = await getMe(longLived.access_token);
    const pages = await listUserPages(longLived.access_token);

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    const { error: connErr } = await supabaseAdmin.from("meta_lead_connections").upsert(
      {
        company_id: companyId,
        meta_user_id: me.id,
        meta_user_name: me.name,
        access_token: longLived.access_token,
        token_expires_at: expiresAt,
        granted_scopes: META_SCOPES.split(","),
        status: "active",
        connected_by: userId,
      },
      { onConflict: "company_id" },
    );
    if (connErr) throw new Error(`Erro ao salvar conexão: ${connErr.message}`);

    const { data: conn } = await supabaseAdmin
      .from("meta_lead_connections")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!conn) throw new Error("Conexão não encontrada após upsert.");

    for (const p of pages) {
      await supabaseAdmin.from("meta_lead_pages").upsert(
        {
          company_id: companyId,
          connection_id: conn.id,
          page_id: p.id,
          page_name: p.name,
          page_access_token: p.access_token,
          category: p.category ?? null,
        },
        { onConflict: "company_id,page_id" },
      );
    }

    return { ok: true, pageCount: pages.length, userName: me.name };
  });

// --------- LIST CONNECTION STATE ---------

export const getMetaConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("memberships")
      .select("company_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.company_id) return { connection: null, pages: [], recentEvents: [] };

    const [connRes, pagesRes, eventsRes] = await Promise.all([
      supabaseAdmin.from("meta_lead_connections").select("*").eq("company_id", mem.company_id).maybeSingle(),
      supabaseAdmin.from("meta_lead_pages").select("*").eq("company_id", mem.company_id).order("page_name"),
      supabaseAdmin
        .from("meta_lead_events")
        .select("id, leadgen_id, page_id, form_id, status, received_at, error_message, lead_id")
        .eq("company_id", mem.company_id)
        .order("received_at", { ascending: false })
        .limit(25),
    ]);

    return {
      connection: connRes.data ?? null,
      pages: pagesRes.data ?? [],
      recentEvents: eventsRes.data ?? [],
    };
  });

// --------- SUBSCRIBE PAGE ---------

export const setPageSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ pageId: z.string().min(1), subscribe: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("memberships")
      .select("company_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.company_id) throw new Error("Empresa não encontrada.");

    const { data: page } = await supabaseAdmin
      .from("meta_lead_pages")
      .select("page_access_token")
      .eq("company_id", mem.company_id)
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (!page) throw new Error("Página não encontrada.");

    const { subscribePageToLeadgen, unsubscribePageFromLeadgen, listPageLeadForms } = await import(
      "@/lib/meta-graph.server"
    );

    if (data.subscribe) {
      await subscribePageToLeadgen(data.pageId, page.page_access_token);
      const forms = await listPageLeadForms(data.pageId, page.page_access_token);
      for (const f of forms) {
        await supabaseAdmin.from("meta_lead_forms").upsert(
          {
            company_id: mem.company_id,
            page_id: data.pageId,
            form_id: f.id,
            form_name: f.name,
            status: f.status ?? null,
            questions: f.questions ?? [],
          },
          { onConflict: "company_id,form_id" },
        );
      }
      await supabaseAdmin
        .from("meta_lead_pages")
        .update({ subscribed: true, subscribed_at: new Date().toISOString() })
        .eq("company_id", mem.company_id)
        .eq("page_id", data.pageId);
    } else {
      await unsubscribePageFromLeadgen(data.pageId, page.page_access_token);
      await supabaseAdmin
        .from("meta_lead_pages")
        .update({ subscribed: false, subscribed_at: null })
        .eq("company_id", mem.company_id)
        .eq("page_id", data.pageId);
    }

    return { ok: true };
  });

// --------- DISCONNECT ---------

export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mem } = await supabaseAdmin
      .from("memberships")
      .select("company_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.company_id) throw new Error("Empresa não encontrada.");
    await supabaseAdmin.from("meta_lead_connections").delete().eq("company_id", mem.company_id);
    return { ok: true };
  });
