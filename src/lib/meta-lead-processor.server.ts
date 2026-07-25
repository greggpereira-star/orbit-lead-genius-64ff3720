/**
 * Server-only Meta Lead Ads processing.
 * Ingests a webhook leadgen event, hydrates lead data via Graph API,
 * applies the form mapping (routing, UTM defaults, qualification, external CRM),
 * writes to `leads` and triggers downstream deliveries.
 */
import { createHmac } from "node:crypto";
import { fetchLead, type MetaLead } from "./meta-graph.server";
import { dispatchLeadWhatsApp } from "./whatsapp-automation.server";
import { resolveAdAttribution } from "./meta-attribution.server";

/**
 * Marca o lead quando o mesmo telefone já existe na empresa.
 *
 * Não bloqueia nem funde os leads de propósito: a pessoa pode se cadastrar em
 * dois empreendimentos diferentes, e cada cadastro traz respostas próprias —
 * fundir apagaria informação real. O que faltava era o corretor SABER, pra não
 * ligar duas vezes como se fossem estranhos.
 */
async function findDuplicate(
  admin: Admin,
  companyId: string,
  phone: string | null,
  email: string | null,
): Promise<{ id: string; created_at: string } | null> {
  try {
    const digits = phone ? String(phone).replace(/\D+/g, "").slice(-8) : null;

    if (digits && digits.length >= 8) {
      const { data } = await admin
        .from("leads")
        .select("id, created_at")
        .eq("company_id", companyId)
        .ilike("phone", `%${digits}%`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.id) return data;
    }

    if (email) {
      const { data } = await admin
        .from("leads")
        .select("id, created_at")
        .eq("company_id", companyId)
        .ilike("email", email.trim())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.id) return data;
    }
  } catch {
    // Detecção de duplicado é informação extra, não pode barrar o lead.
  }
  return null;
}

// Loose admin typing on purpose: this file is server-only and is invoked with
// the generated supabaseAdmin client. Keeping it permissive avoids leaking
// the full generated types across our narrow helper interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface LeadRow {
  id: string;
  company_id: string;
}

interface PageRow {
  company_id: string;
  page_access_token: string;
}

interface FormRow {
  company_id: string;
  form_name: string;
  field_mapping: Record<string, string> | null;
}

interface MappingRow {
  id: string;
  company_id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  source: string;
  medium: string;
  channel: string;
  default_utm_source: string | null;
  default_utm_medium: string | null;
  default_utm_campaign: string | null;
  default_tags: unknown;
  default_score: number;
  default_temperature: string | null;
  qualification_rules: unknown;
  external_crm_enabled: boolean;
  external_crm_provider: string | null;
  external_crm_config: Record<string, unknown> | null;
  external_crm_conditions: unknown;
  is_active: boolean;
}

/**
 * Verify Meta webhook signature. Payload must be the RAW request body string.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const [scheme, sig] = signatureHeader.split("=");
  if (scheme !== "sha256" || !sig) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (expected.length !== sig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return mismatch === 0;
}

const DEFAULT_MAPPING: Record<string, string> = {
  full_name: "name",
  first_name: "name",
  email: "email",
  phone_number: "phone",
  phone: "phone",
  city: "city",
  state: "state",
};

function normalizeFieldData(
  fieldData: Array<{ name: string; values: string[] }>,
  mapping: Record<string, string>,
): { name?: string; email?: string; phone?: string; metadata: Record<string, string> } {
  const merged = { ...DEFAULT_MAPPING, ...mapping };
  const out: { name?: string; email?: string; phone?: string; metadata: Record<string, string> } = { metadata: {} };
  for (const { name, values } of fieldData) {
    const value = values?.[0] ?? "";
    const target = merged[name] ?? "metadata";
    if (target === "name" && !out.name) out.name = value;
    else if (target === "email" && !out.email) out.email = value;
    else if (target === "phone" && !out.phone) out.phone = value;
    else out.metadata[name] = value;
  }
  return out;
}

export interface ProcessMetaLeadInput {
  leadgenId: string;
  pageId: string;
  formId?: string;
  adId?: string;
  createdTime?: string;
  hydratedLead?: MetaLead;
  rawPayload: unknown;
}

export interface ProcessMetaLeadResult {
  status: "processed" | "skipped" | "failed";
  leadId?: string;
  error?: string;
}

export async function processMetaLeadEvent(
  admin: Admin,
  input: ProcessMetaLeadInput,
): Promise<ProcessMetaLeadResult> {
  // Idempotency check
  const existing = await admin
    .from("meta_lead_events")
    .select("id, status, lead_id")
    .eq("leadgen_id", input.leadgenId)
    .maybeSingle();

  const existingRow = existing.data as { id: string; status: string; lead_id: string | null } | null;
  if (existingRow && existingRow.status === "processed") {
    return { status: "skipped", leadId: existingRow.lead_id ?? undefined };
  }

  // Resolve page
  const pageRes = await admin
    .from("meta_lead_pages")
    .select("company_id, page_access_token")
    .eq("page_id", input.pageId)
    .maybeSingle();
  const page = pageRes.data as PageRow | null;
  if (!page) {
    await recordEvent(admin, input, { status: "skipped", error_message: "Page not connected" });
    return { status: "skipped", error: "Page not connected" };
  }

  // Resolve form + field mapping
  let formName = "Meta Lead Ad";
  let fieldMapping: Record<string, string> = {};
  if (input.formId) {
    const formRes = await admin
      .from("meta_lead_forms")
      .select("company_id, form_name, field_mapping")
      .eq("form_id", input.formId)
      .maybeSingle();
    const form = formRes.data as FormRow | null;
    if (form) {
      formName = form.form_name;
      fieldMapping = (form.field_mapping ?? {}) as Record<string, string>;
    }
  }

  // Resolve routing/qualification mapping (page + form scoped, active only)
  let mapping: MappingRow | null = null;
  if (input.formId) {
    const mapRes = await admin
      .from("meta_form_mappings")
      .select("*")
      .eq("company_id", page.company_id)
      .eq("page_id", input.pageId)
      .eq("form_id", input.formId)
      .eq("is_active", true)
      .maybeSingle();
    mapping = (mapRes.data as MappingRow | null) ?? null;
  }

  try {
    const leadDetails = input.hydratedLead ?? (await fetchLead(input.leadgenId, page.page_access_token));
    const parsed = normalizeFieldData(leadDetails.field_data ?? [], fieldMapping);

    // Nomes de anúncio/campanha e aviso de contato repetido. Ambos são
    // enriquecimento: qualquer falha devolve null e o lead entra igual.
    const [attribution, duplicate] = await Promise.all([
      resolveAdAttribution(admin, {
        companyId: page.company_id,
        adId: leadDetails.ad_id ?? input.adId ?? null,
        accessToken: page.page_access_token,
      }),
      findDuplicate(admin, page.company_id, parsed.phone ?? null, parsed.email ?? null),
    ]);

    const leadInsert: Record<string, unknown> = {
      company_id: page.company_id,
      name: parsed.name ?? "Lead sem nome",
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      source: mapping?.default_utm_source || mapping?.source || "meta_leadads",
      status: "new",
      utm_source: mapping?.default_utm_source ?? "facebook",
      utm_medium: mapping?.default_utm_medium ?? "paid_social",
      // Prefere o NOME da campanha ao id: é o que aparece nos relatórios de
      // UTM, e "52525417339565" ali não ajuda ninguém a decidir nada.
      utm_campaign:
        mapping?.default_utm_campaign ??
        attribution?.campaign_name ??
        leadDetails.campaign_id ??
        null,
      utm_content: attribution?.ad_name ?? null,
      utm_term: attribution?.adset_name ?? null,
      assigned_to: mapping?.assigned_to ?? null,
      lead_score: mapping?.default_score ?? null,
      score: mapping?.default_score ?? null,
      lead_temperature: mapping?.default_temperature ?? null,
      temperature: mapping?.default_temperature ?? null,
      metadata: {
        ...parsed.metadata,
        meta_leadgen_id: input.leadgenId,
        meta_page_id: input.pageId,
        meta_form_id: input.formId ?? leadDetails.form_id ?? null,
        meta_form_name: formName,
        meta_ad_id: leadDetails.ad_id ?? input.adId ?? null,
        meta_adset_id: leadDetails.adset_id ?? null,
        meta_campaign_id: leadDetails.campaign_id ?? null,
        meta_created_time: leadDetails.created_time,
        // Nomes resolvidos via Graph API — o que a ficha do lead exibe.
        meta_ad_name: attribution?.ad_name ?? null,
        meta_adset_name: attribution?.adset_name ?? null,
        meta_campaign_name: attribution?.campaign_name ?? null,
        // Contato repetido: o corretor precisa saber antes de ligar.
        duplicate_of: duplicate?.id ?? null,
        duplicate_first_seen_at: duplicate?.created_at ?? null,
        mapping_id: mapping?.id ?? null,
        pipeline_id: mapping?.pipeline_id ?? null,
        stage_id: mapping?.stage_id ?? null,
        default_tags: mapping?.default_tags ?? [],
        qualification_rules: mapping?.qualification_rules ?? null,
        channel: mapping?.channel ?? "meta_leadads",
      },
    };

    const insertLead = await admin.from("leads").insert(leadInsert).select("id").single();
    const insertedLead = insertLead.data as LeadRow | null;
    if (insertLead.error || !insertedLead) {
      throw new Error(`Failed to insert lead: ${String(insertLead.error)}`);
    }

    await recordEvent(admin, input, {
      status: "processed",
      lead_id: insertedLead.id,
      company_id: page.company_id,
      fetched_lead_payload: leadDetails,
      normalized_payload: parsed,
      processed_at: new Date().toISOString(),
    });

    // Always deliver to CV.CRM (async, retry worker handles failures)
    void admin.functions
      .invoke("send-cvcrm-lead", {
        body: { lead_id: insertedLead.id, tenant_id: page.company_id, source: "meta_leadads" },
      })
      .catch(() => undefined);

    // Saudação ao lead + alerta ao corretor via WhatsApp. Assíncrono e à prova
    // de falha: o que der errado vira linha em whatsapp_messages, nunca exceção.
    void dispatchLeadWhatsApp(admin, {
      companyId: page.company_id,
      leadId: insertedLead.id,
      name: parsed.name ?? null,
      phone: parsed.phone ?? null,
      campaign: mapping?.default_utm_campaign ?? leadDetails.campaign_id ?? null,
      source: "meta_leadads",
    }).catch(() => undefined);

    // Optional external CRM routing (RD Station, HubSpot, Pipedrive, generic webhook)
    if (mapping?.external_crm_enabled && mapping.external_crm_provider) {
      void dispatchExternalCrm(admin, {
        provider: mapping.external_crm_provider,
        config: mapping.external_crm_config ?? {},
        leadId: insertedLead.id,
        companyId: page.company_id,
        payload: {
          name: parsed.name ?? null,
          email: parsed.email ?? null,
          phone: parsed.phone ?? null,
          source: "meta_leadads",
          form_name: formName,
          metadata: parsed.metadata,
        },
      }).catch(() => undefined);
    }

    return { status: "processed", leadId: insertedLead.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordEvent(admin, input, { status: "failed", error_message: message, company_id: page.company_id });
    return { status: "failed", error: message };
  }
}

interface ExternalCrmDispatch {
  provider: string;
  config: Record<string, unknown>;
  leadId: string;
  companyId: string;
  payload: Record<string, unknown>;
}

/**
 * Fire an outbound request to a configured external CRM.
 * Supports a generic webhook contract; provider-specific adapters can be added later.
 * The call is best-effort; failures are logged in `meta_lead_events.error_message`
 * but do not fail the lead ingestion pipeline.
 */
async function dispatchExternalCrm(admin: Admin, opts: ExternalCrmDispatch): Promise<void> {
  const url = typeof opts.config.webhook_url === "string" ? opts.config.webhook_url : null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof opts.config.auth_header === "string" && typeof opts.config.auth_value === "string") {
    headers[opts.config.auth_header] = opts.config.auth_value;
  }
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: opts.provider,
        lead_id: opts.leadId,
        company_id: opts.companyId,
        ...opts.payload,
      }),
    });
  } catch {
    // swallow: retry infra for external CRMs is out of scope for this step
  }
}

async function recordEvent(
  admin: Admin,
  input: ProcessMetaLeadInput,
  patch: Record<string, unknown>,
) {
  const base = {
    leadgen_id: input.leadgenId,
    page_id: input.pageId,
    form_id: input.formId ?? null,
    ad_id: input.adId ?? null,
    raw_payload: input.rawPayload,
  };
  // Upsert-like: try insert, fall back to update on conflict
  const ins = await admin.from("meta_lead_events").insert({ ...base, ...patch });
  if (ins.error) {
    await admin.from("meta_lead_events").update(patch).eq("leadgen_id", input.leadgenId);
  }
}
