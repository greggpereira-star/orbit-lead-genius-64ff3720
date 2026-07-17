/**
 * Meta Lead Ads — Form sync + form-mapping server functions.
 * Client-safe module: server-only imports live inside `.handler()` bodies.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Resolve the caller's company id via memberships.
 * Uses the admin client for a stable, RLS-independent lookup after auth.
 */
async function resolveCompanyId(admin: unknown, userId: string): Promise<string> {
  const client = admin as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: unknown) => {
          limit: (n: number) => {
            maybeSingle: () => Promise<{ data: { company_id: string } | null }>;
          };
        };
      };
    };
  };
  const { data } = await client
    .from("memberships")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Usuário sem empresa vinculada.");
  return data.company_id;
}

function newTraceId(): string {
  return `mt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// -------------------------------------------------------------
// syncMetaLeadForms — busca /v25.0/{page_id}/leadgen_forms
// -------------------------------------------------------------

export const syncMetaLeadForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ pageId: z.string().min(1) }).parse(raw))
  .handler(async ({ data, context }) => {
    const trace_id = newTraceId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { data: page } = await supabaseAdmin
      .from("meta_lead_pages")
      .select("page_access_token, page_name")
      .eq("company_id", companyId)
      .eq("page_id", data.pageId)
      .maybeSingle();

    if (!page?.page_access_token) {
      throw new Error(
        "Página não encontrada ou sem access token. Reconecte a integração Meta.",
      );
    }

    const { listPageLeadForms, MetaGraphError } = await import("@/lib/meta-graph.server");
    let forms: Array<{
      id: string;
      name: string;
      status?: string;
      leads_count?: number;
      questions?: Array<{ key: string; label: string; type: string }>;
    }> = [];
    try {
      forms = (await listPageLeadForms(data.pageId, page.page_access_token)) as typeof forms;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof MetaGraphError ? err.status : undefined;
      const code = err instanceof MetaGraphError ? err.graph?.code : undefined;

      if (status === 401 || code === 190) {
        throw new Error(
          "Token do Facebook expirado ou revogado. Reconecte a integração Meta.",
        );
      }
      if (status === 403 || code === 200 || code === 10) {
        throw new Error(
          "Não foi possível listar formulários. A permissão leads_retrieval ou pages_manage_metadata pode estar ausente no token atual.",
        );
      }
      throw new Error(`Falha ao consultar Meta Graph API: ${message}`);
    }

    const now = new Date().toISOString();
    for (const f of forms) {
      await supabaseAdmin.from("meta_lead_forms").upsert(
        {
          company_id: companyId,
          page_id: data.pageId,
          page_name: page.page_name,
          form_id: f.id,
          form_name: f.name,
          status: f.status ?? null,
          questions: f.questions ?? [],
          leads_count: f.leads_count ?? 0,
          raw_payload: f as never,
          last_synced_at: now,
        },
        { onConflict: "company_id,form_id" },
      );
    }

    console.info("[meta-forms] sync ok", {
      trace_id,
      companyId,
      pageId: data.pageId,
      count: forms.length,
    });

    return {
      success: true,
      page_id: data.pageId,
      forms_synced: forms.length,
      forms: forms.map((f) => ({
        form_id: f.id,
        name: f.name,
        status: f.status ?? null,
        leads_count: f.leads_count ?? 0,
      })),
      trace_id,
    };
  });

// -------------------------------------------------------------
// listMetaForms — leitura dos formulários salvos + mapeamento
// -------------------------------------------------------------

export const listMetaForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const [formsRes, mappingsRes] = await Promise.all([
      supabaseAdmin
        .from("meta_lead_forms")
        .select(
          "id, page_id, page_name, form_id, form_name, status, leads_count, questions, last_synced_at, is_active",
        )
        .eq("company_id", companyId)
        .order("page_name", { ascending: true }),
      supabaseAdmin
        .from("meta_form_mappings")
        .select(
          "id, form_id, page_id, is_active, pipeline_id, stage_id, assigned_to, default_tags, default_score, default_temperature, external_crm_enabled, external_crm_provider, updated_at",
        )
        .eq("company_id", companyId),
    ]);

    const mapByFormId = new Map<string, unknown>();
    for (const m of mappingsRes.data ?? []) {
      mapByFormId.set((m as { form_id: string }).form_id, m);
    }

    return {
      forms: (formsRes.data ?? []).map((f) => ({
        ...f,
        mapping: mapByFormId.get((f as { form_id: string }).form_id) ?? null,
      })),
    };
  });

// -------------------------------------------------------------
// saveMetaFormMapping — upsert do mapeamento
// -------------------------------------------------------------

const mappingSchema = z.object({
  id: z.string().uuid().optional(),
  page_id: z.string().min(1),
  page_name: z.string().optional().nullable(),
  form_id: z.string().min(1),
  form_name: z.string().optional().nullable(),
  is_active: z.boolean().default(true),

  source: z.string().default("facebook"),
  channel: z.string().default("meta_lead_ads"),
  medium: z.string().default("lead_ads"),

  default_utm_source: z.string().optional().nullable(),
  default_utm_medium: z.string().optional().nullable(),
  default_utm_campaign: z.string().optional().nullable(),

  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),

  default_tags: z.array(z.string()).default([]),
  default_score: z.number().int().default(0),
  default_temperature: z.enum(["cold", "warm", "hot"]).optional().nullable(),

  qualification_rules: z
    .array(
      z.object({
        field: z.string(),
        op: z.enum(["eq", "neq", "contains", "exists", "gt", "lt", "gte", "lte", "in"]),
        value: z.unknown().optional(),
        action: z.enum(["add_tag", "add_score", "set_temperature", "set_assigned_to", "set_stage"]),
        param: z.unknown().optional(),
      }),
    )
    .default([]),

  external_crm_enabled: z.boolean().default(false),
  external_crm_provider: z.string().optional().nullable(),
  external_crm_config: z.record(z.unknown()).default({}),
  external_crm_conditions: z.record(z.unknown()).default({}),
});

export const saveMetaFormMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => mappingSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const row = {
      company_id: companyId,
      created_by: context.userId,
      ...data,
    };

    const { data: saved, error } = await supabaseAdmin
      .from("meta_form_mappings")
      .upsert(row as never, { onConflict: "company_id,form_id" })
      .select("id, form_id")
      .single();

    if (error) throw new Error(`Erro ao salvar mapeamento: ${error.message}`);
    return { ok: true, id: saved.id, form_id: saved.form_id };
  });

// -------------------------------------------------------------
// deleteMetaFormMapping
// -------------------------------------------------------------

export const deleteMetaFormMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { error } = await supabaseAdmin
      .from("meta_form_mappings")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------------------------------------------------
// listMetaMappingOptions — stages + members for drawer selects
// -------------------------------------------------------------

export const listMetaMappingOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const [stagesRes, membersRes] = await Promise.all([
      supabaseAdmin
        .from("stages")
        .select("id, name, order_index")
        .eq("company_id", companyId)
        .order("order_index", { ascending: true }),
      supabaseAdmin
        .from("memberships")
        .select("user_id, role")
        .eq("company_id", companyId),
    ]);

    return {
      stages: stagesRes.data ?? [],
      members: membersRes.data ?? [],
    };
  });

// -------------------------------------------------------------
// importMetaFormLeads — importação retroativa paginada de leads
// -------------------------------------------------------------

const importSchema = z.object({
  formId: z.string().min(1),
  since: z.string().optional().nullable(),
  until: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(500).default(200),
});

function normalizeDateBoundary(value: string | null | undefined, endOfDay: boolean): string | null {
  if (!value) return null;
  if (value.includes("T")) return new Date(value).toISOString();
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
}

export const importMetaFormLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => importSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const trace_id = newTraceId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);
    const since = normalizeDateBoundary(data.since, false);
    const until = normalizeDateBoundary(data.until, true);

    const { data: form, error: formError } = await supabaseAdmin
      .from("meta_lead_forms")
      .select("form_id, form_name, page_id")
      .eq("company_id", companyId)
      .eq("form_id", data.formId)
      .maybeSingle();

    if (formError) throw new Error(`Erro ao carregar formulário Meta: ${formError.message}`);
    if (!form) throw new Error("Formulário não encontrado. Sincronize os formulários antes de importar leads.");

    const { data: page, error: pageError } = await supabaseAdmin
      .from("meta_lead_pages")
      .select("page_access_token")
      .eq("company_id", companyId)
      .eq("page_id", form.page_id)
      .maybeSingle();

    if (pageError) throw new Error(`Erro ao carregar página Meta: ${pageError.message}`);
    if (!page?.page_access_token) {
      throw new Error("Página sem token ativo. Reconecte a integração Meta antes da importação.");
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("meta_lead_import_jobs")
      .insert({
        company_id: companyId,
        form_id: form.form_id,
        page_id: form.page_id,
        status: "processing",
        since,
        until,
        started_at: new Date().toISOString(),
        trace_id,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(`Erro ao criar job de importação: ${jobError?.message ?? "job vazio"}`);
    }

    try {
      const { listFormLeads, MetaGraphError } = await import("@/lib/meta-graph.server");
      const { processMetaLeadEvent } = await import("@/lib/meta-lead-processor.server");
      const leads = await listFormLeads({
        formId: form.form_id,
        pageAccessToken: page.page_access_token,
        since: since ?? undefined,
        until: until ?? undefined,
        limit: data.limit,
      });

      let imported = 0;
      let duplicates = 0;
      let failed = 0;

      for (const lead of leads) {
        const result = await processMetaLeadEvent(supabaseAdmin as never, {
          leadgenId: lead.id,
          pageId: form.page_id,
          formId: form.form_id,
          adId: lead.ad_id,
          createdTime: lead.created_time,
          hydratedLead: lead,
          rawPayload: {
            source: "manual_meta_import",
            job_id: job.id,
            lead,
          },
        });

        if (result.status === "processed") imported += 1;
        else if (result.status === "skipped") duplicates += 1;
        else failed += 1;
      }

      const { error: updateError } = await supabaseAdmin
        .from("meta_lead_import_jobs")
        .update({
          status: failed > 0 ? "completed_with_errors" : "completed",
          finished_at: new Date().toISOString(),
          total_found: leads.length,
          total_imported: imported,
          total_duplicates: duplicates,
          total_failed: failed,
        })
        .eq("id", job.id)
        .eq("company_id", companyId);

      if (updateError) throw new Error(`Erro ao finalizar job: ${updateError.message}`);

      console.info("[meta-import] completed", {
        trace_id,
        companyId,
        formId: form.form_id,
        found: leads.length,
        imported,
        duplicates,
        failed,
      });

      return {
        ok: true,
        job_id: job.id,
        trace_id,
        total_found: leads.length,
        total_imported: imported,
        total_duplicates: duplicates,
        total_failed: failed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { MetaGraphError } = await import("@/lib/meta-graph.server");
      const graphError = err instanceof MetaGraphError ? err.graph : undefined;
      const safeMessage = graphError?.code === 190
        ? "Token do Facebook expirado ou revogado. Reconecte a integração Meta."
        : message;

      await supabaseAdmin
        .from("meta_lead_import_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: safeMessage,
        })
        .eq("id", job.id)
        .eq("company_id", companyId);

      throw new Error(safeMessage);
    }
  });

export const listMetaImportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveCompanyId(supabaseAdmin, context.userId);

    const { data: jobs, error } = await supabaseAdmin
      .from("meta_lead_import_jobs")
      .select("id, form_id, page_id, status, since, until, started_at, finished_at, total_found, total_imported, total_duplicates, total_failed, error_message, trace_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(`Erro ao listar importações: ${error.message}`);

    return { jobs: jobs ?? [] };
  });

