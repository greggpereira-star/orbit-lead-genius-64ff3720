/**
 * Server-only Meta Lead Ads processing.
 * Ingests a webhook leadgen event, hydrates lead data via Graph API,
 * writes to `leads` and triggers CV.CRM delivery.
 */
import { createHmac } from "node:crypto";
import { fetchLead } from "./meta-graph.server";

interface SupabaseAdminLike {
  from: (t: string) => {
    select: (c?: string) => {
      eq: (a: string, b: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        limit?: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
    insert: (rows: unknown) => Promise<{ data: unknown; error: unknown }> & {
      select: (c?: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
    update: (patch: unknown) => { eq: (a: string, b: unknown) => Promise<{ error: unknown }> };
  };
  functions: {
    invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }>;
  };
}

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
  field_mapping: Record<string, string>;
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
  rawPayload: unknown;
}

export interface ProcessMetaLeadResult {
  status: "processed" | "skipped" | "failed";
  leadId?: string;
  error?: string;
}

export async function processMetaLeadEvent(
  admin: SupabaseAdminLike,
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

  // Resolve page + form
  const pageRes = await admin.from("meta_lead_pages").select("company_id, page_access_token").eq("page_id", input.pageId).maybeSingle();
  const page = pageRes.data as PageRow | null;
  if (!page) {
    await recordEvent(admin, input, { status: "skipped", error_message: "Page not connected" });
    return { status: "skipped", error: "Page not connected" };
  }

  let formName = "Meta Lead Ad";
  let mapping: Record<string, string> = {};
  if (input.formId) {
    const formRes = await admin.from("meta_lead_forms").select("company_id, form_name, field_mapping").eq("form_id", input.formId).maybeSingle();
    const form = formRes.data as FormRow | null;
    if (form) {
      formName = form.form_name;
      mapping = form.field_mapping ?? {};
    }
  }

  try {
    const leadDetails = await fetchLead(input.leadgenId, page.page_access_token);
    const parsed = normalizeFieldData(leadDetails.field_data ?? [], mapping);

    const insertLead = await admin.from("leads").insert({
      company_id: page.company_id,
      name: parsed.name ?? "Lead sem nome",
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      source: "meta_leadads",
      status: "new",
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_campaign: leadDetails.campaign_id ?? null,
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
      },
    }).select("id").single();

    const insertedLead = insertLead.data as LeadRow | null;
    if (insertLead.error || !insertedLead) {
      throw new Error(`Failed to insert lead: ${String(insertLead.error)}`);
    }

    await recordEvent(admin, input, {
      status: "processed",
      lead_id: insertedLead.id,
      company_id: page.company_id,
      processed_at: new Date().toISOString(),
    });

    // Fire-and-forget CV.CRM delivery (retry worker will pick up failures)
    void admin.functions.invoke("send-cvcrm-lead", {
      body: { lead_id: insertedLead.id, tenant_id: page.company_id, source: "meta_leadads" },
    }).catch(() => undefined);

    return { status: "processed", leadId: insertedLead.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordEvent(admin, input, { status: "failed", error_message: message, company_id: page.company_id });
    return { status: "failed", error: message };
  }
}

async function recordEvent(
  admin: SupabaseAdminLike,
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
