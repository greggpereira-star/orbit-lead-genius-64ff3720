/**
 * Meta OAuth server functions (v25) — client-safe module (handlers strip server-only imports).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeAdministrar } from "@/lib/whatsapp/papeis";
import { planejarSelecao } from "@/lib/meta-paginas";

/* eslint-disable @typescript-eslint/no-explicit-any */
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
  // Necessário para `fetchAdAttribution` ler o nó do anúncio (adset/campaign) e
  // dizer de qual anúncio o lead veio. Já esteve aqui, mas só no arquivo do
  // servidor — nunca chegou ao git, e um deploy por cópia sobrescreveu de volta
  // pela versão do repositório. A conexão de 21/07 tinha o escopo; a de hoje
  // não. Sem ele a atribuição volta nula sem erro, porque a chamada é engolida
  // por um catch.
  "ads_read",
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
      // Os dois domínios lovable.app saíram daqui: esta é a allowlist de
      // origens aceitas no retorno do OAuth do Meta, e eram endereços que
      // nós não controlamos mais. Quem precisar de origem extra usa
      // META_OAUTH_ALLOWED_ORIGINS, sem recompilar.
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

    // O Facebook nem sempre devolve `expires_in` na troca por longa duração.
    // Quando não devolvia, isto gravava `null` — e o aviso preventivo da tela,
    // que só aparece com data preenchida, virava código morto. Ficou treze dias
    // sem avisar nada. Token de usuário de longa duração vale ~60 dias; sem a
    // informação exata, assumir 60 faz o aviso disparar perto da hora certa, que
    // é infinitamente melhor que não disparar nunca.
    const SESSENTA_DIAS = 60 * 24 * 60 * 60;
    const expiresAt = new Date(
      Date.now() + (longLived.expires_in || SESSENTA_DIAS) * 1000,
    ).toISOString();

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

    // NÃO grava as páginas que a Meta devolveu. O login traz todas as páginas que esta pessoa já
    // liberou ao app, de todos os clientes, e gravá-las aqui era o que misturava uma empresa com a
    // outra. A empresa só passa a ter uma página quando alguém a escolhe (`saveMetaPages`).
    // As que a empresa já tinha escolhido só renovam o token, para a reconexão não quebrá-las.
    const { data: atuais } = await supabaseAdmin
      .from("meta_lead_pages")
      .select("page_id")
      .eq("company_id", companyId);
    const jaEscolhidas = new Set((atuais ?? []).map((r: { page_id: string }) => r.page_id));
    for (const p of pages.filter((x) => jaEscolhidas.has(x.id))) {
      await supabaseAdmin
        .from("meta_lead_pages")
        .update({
          connection_id: conn.id,
          page_name: p.name,
          page_access_token: p.access_token,
          category: p.category ?? null,
        })
        .eq("company_id", companyId)
        .eq("page_id", p.id);
    }

    return {
      ok: true,
      userName: me.name,
      /** Quantas páginas a empresa tem escolhidas; zero = falta escolher. */
      pageCount: jaEscolhidas.size,
      /** Quantas a conta da Meta oferece. */
      disponiveis: pages.length,
    };
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

    // Colunas explícitas, NUNCA `select("*")`.
    //
    // O `*` arrastava `access_token` e `page_access_token` para o payload que o
    // TanStack serializa e entrega ao navegador. São tokens com leads_retrieval
    // e ads_read: quem lesse a resposta dessa página passava a conseguir ler os
    // leads e os dados de anúncio do cliente. Listar coluna a coluna é o que
    // impede uma coluna sensível nova de vazar sozinha no dia em que alguém a
    // adicionar na tabela.
    const [connRes, pagesRes, eventsRes] = await Promise.all([
      supabaseAdmin
        .from("meta_lead_connections")
        .select("id, company_id, meta_user_id, meta_user_name, token_expires_at, granted_scopes, status, connected_by, created_at, updated_at")
        .eq("company_id", mem.company_id)
        .maybeSingle(),
      supabaseAdmin
        .from("meta_lead_pages")
        .select("id, company_id, connection_id, page_id, page_name, category, subscribed, subscribed_at, created_at, updated_at")
        .eq("company_id", mem.company_id)
        .order("page_name"),
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

// --------- ESCOLHER AS PÁGINAS DA EMPRESA ---------

export interface PaginaCandidata {
  page_id: string;
  nome: string;
  categoria: string | null;
  /** Já é desta empresa. */
  selecionada: boolean;
  /** Já pertence a OUTRA empresa: não pode ser escolhida aqui. */
  deOutraEmpresa: boolean;
}

/**
 * A empresa do usuário no Meta, resolvida do MESMO jeito que as demais funções deste arquivo
 * (primeiro vínculo, sem ordem), para a tela e a escolha de páginas mirarem sempre a mesma empresa.
 * Não usa `papelNaEmpresa`: ele ordena, e quem tem dois vínculos (cadastro duplicado) cairia em
 * outra empresa que a das conexões já gravadas.
 */
async function empresaEPapel(admin: any, userId: string): Promise<{ companyId: string; role: string }> {
  const { data: mem } = await admin
    .from("memberships")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!mem?.company_id) throw new Error("Usuário sem empresa vinculada.");
  const { data: papel } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", mem.company_id)
    .limit(1)
    .maybeSingle();
  return { companyId: mem.company_id as string, role: String(papel?.role ?? "viewer") };
}

async function conexaoDaEmpresa(admin: any, companyId: string) {
  const { data } = await admin
    .from("meta_lead_connections")
    .select("id, access_token, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data?.access_token || data.status === "revoked") {
    throw new Error("Conecte o Facebook antes de escolher as páginas.");
  }
  return data as { id: string; access_token: string; status: string };
}

async function paginasDaMeta(admin: any, companyId: string, accessToken: string) {
  const { listUserPages } = await import("@/lib/meta-graph.server");
  const { tokenMorreu, motivoDaRevogacao, marcarConexaoRevogada } = await import(
    "@/lib/meta-token-state.server"
  );
  try {
    return await listUserPages(accessToken);
  } catch (err) {
    if (tokenMorreu(err)) {
      await marcarConexaoRevogada(admin, companyId, err);
      throw new Error(`${motivoDaRevogacao(err)} Reconecte a integração Meta.`);
    }
    throw new Error(err instanceof Error ? err.message : "Falha ao consultar a Meta.");
  }
}

/**
 * As páginas que a conta do Facebook enxerga, para a pessoa marcar quais são DESTA empresa.
 * Nunca devolve token. Página que já é de outra empresa vem marcada e não pode ser escolhida;
 * o nome da outra empresa não aparece.
 */
export const listMetaPageCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaginaCandidata[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await empresaEPapel(admin, context.userId);
    if (!podeAdministrar(role)) throw new Error("Apenas dono ou administrador escolhe as páginas.");

    const conexao = await conexaoDaEmpresa(admin, companyId);
    const daMeta = await paginasDaMeta(admin, companyId, conexao.access_token);
    const ids = daMeta.map((p) => p.id);

    const { data: registradas } = ids.length
      ? await admin.from("meta_lead_pages").select("page_id, company_id").in("page_id", ids)
      : { data: [] };
    const minhas = new Set<string>();
    const alheias = new Set<string>();
    for (const r of (registradas ?? []) as Array<{ page_id: string; company_id: string }>) {
      (r.company_id === companyId ? minhas : alheias).add(r.page_id);
    }

    return daMeta
      .map((p) => ({
        page_id: p.id,
        nome: p.name,
        categoria: p.category ?? null,
        selecionada: minhas.has(p.id),
        deOutraEmpresa: alheias.has(p.id) && !minhas.has(p.id),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

/**
 * Grava a escolha: SÓ as páginas marcadas ficam com a empresa. As que ela tinha e foram
 * desmarcadas saem (e o recebimento automático delas é desligado, quando estava ligado). A lista
 * da Meta é consultada de novo aqui: o navegador não decide o que a conexão enxerga.
 */
export const saveMetaPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ pageIds: z.array(z.string().regex(/^\d+$/)).max(200) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await empresaEPapel(admin, context.userId);
    if (!podeAdministrar(role)) throw new Error("Apenas dono ou administrador escolhe as páginas.");

    const conexao = await conexaoDaEmpresa(admin, companyId);
    const daMeta = await paginasDaMeta(admin, companyId, conexao.access_token);

    const { data: registradas } = await admin
      .from("meta_lead_pages")
      .select("page_id, company_id, subscribed, page_access_token")
      .in("page_id", [...new Set([...daMeta.map((p: { id: string }) => p.id), ...data.pageIds])]);
    const linhas = (registradas ?? []) as Array<{
      page_id: string;
      company_id: string;
      subscribed: boolean;
      page_access_token: string;
    }>;
    // Páginas da empresa que a Meta já não lista também precisam poder ser removidas.
    const { data: todasDaEmpresa } = await admin
      .from("meta_lead_pages")
      .select("page_id, subscribed, page_access_token")
      .eq("company_id", companyId);
    const daEmpresa = (todasDaEmpresa ?? []) as Array<{
      page_id: string;
      subscribed: boolean;
      page_access_token: string;
    }>;

    const plano = planejarSelecao({
      disponiveis: daMeta,
      daEmpresa: daEmpresa.map((r) => r.page_id),
      deOutrasEmpresas: linhas.filter((r) => r.company_id !== companyId).map((r) => r.page_id),
      escolhidas: data.pageIds,
    });
    if (plano.indisponiveis.length > 0) {
      throw new Error("Uma das páginas escolhidas não está disponível para esta conexão. Atualize a lista.");
    }
    if (plano.deOutraEmpresa.length > 0) {
      throw new Error("Uma das páginas escolhidas já está vinculada a outra empresa.");
    }

    const { unsubscribePageFromLeadgen } = await import("@/lib/meta-graph.server");
    for (const id of plano.remover) {
      const antiga = daEmpresa.find((r) => r.page_id === id);
      if (antiga?.subscribed) {
        // Melhor esforço: se a Meta recusar, a página sai da empresa do mesmo jeito.
        await unsubscribePageFromLeadgen(id, antiga.page_access_token).catch(() => undefined);
      }
      await admin.from("meta_lead_pages").delete().eq("company_id", companyId).eq("page_id", id);
      // Os formulários ficam (com mapeamento e histórico), mas inativos: sem a página,
      // nenhum lead novo deles tem como entrar.
      await admin
        .from("meta_lead_forms")
        .update({ is_active: false })
        .eq("company_id", companyId)
        .eq("page_id", id);
    }

    for (const id of [...plano.adicionar, ...plano.manter]) {
      const p = daMeta.find((x: { id: string }) => x.id === id)!;
      const { error } = await admin.from("meta_lead_pages").upsert(
        {
          company_id: companyId,
          connection_id: conexao.id,
          page_id: p.id,
          page_name: p.name,
          page_access_token: p.access_token,
          category: p.category ?? null,
        },
        { onConflict: "company_id,page_id" },
      );
      if (error) {
        // Índice único em page_id: outra empresa pegou a página no meio do caminho.
        if (error.code === "23505") throw new Error("Uma das páginas escolhidas já está vinculada a outra empresa.");
        throw new Error(`Erro ao salvar a página: ${error.message}`);
      }
    }

    await admin
      .from("audit_logs")
      .insert({
        company_id: companyId,
        user_id: context.userId,
        action: "paginas_meta_escolhidas",
        entity_type: "meta_lead_pages",
        entity_id: companyId,
        changes: { adicionadas: plano.adicionar, removidas: plano.remover },
      })
      .then(() => undefined, () => undefined);

    return { ok: true as const, adicionadas: plano.adicionar.length, removidas: plano.remover.length };
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
