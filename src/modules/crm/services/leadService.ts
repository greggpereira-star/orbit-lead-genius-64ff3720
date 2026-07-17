import { supabase } from '@/lib/supabase';
import type { Database, Json } from '@/integrations/supabase/types';

export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type LeadInsert = Database['public']['Tables']['leads']['Insert'];
export type LeadEventRow = Database['public']['Tables']['lead_events']['Row'];

export type LeadTemperature = 'hot' | 'warm' | 'cold';

export interface LeadFilters {
  search?: string;
  status?: string;
  temperature?: LeadTemperature | 'all';
  includeArchived?: boolean;
  assignment?: 'all' | 'mine' | 'unassigned';
  currentUserId?: string | null;
  metaFormId?: string | 'all';
}

export interface MetaFormOption {
  form_id: string;
  form_name: string;
}


export interface CreateLeadInput {
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
}

export interface UpdateLeadStatusInput {
  leadId: string;
  companyId: string;
  status: string;
}

export interface ArchiveLeadInput {
  leadId: string;
  companyId: string;
}

export interface LeadPageView {
  id: string;
  title: string | null;
  url: string;
  created_at: string | null;
}

export interface LeadDetails {
  lead: LeadRow;
  events: LeadEventRow[];
  tracking: LeadPageView[];
  analysis: Record<string, Json> | null;
}

const EMPTY_METADATA: Record<string, Json> = {};

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeSearchTerm(value: string): string {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ');
}

function isJsonRecord(value: Json | null | undefined): value is Record<string, Json> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRecordString(record: Record<string, Json>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createTemperature(score: number): LeadTemperature {
  if (score >= 75) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function getLeadMetadata(lead: LeadRow): Record<string, Json> {
  return isJsonRecord(lead.metadata) ? lead.metadata : EMPTY_METADATA;
}

export function getLeadScore(lead: LeadRow): number {
  return Math.max(0, Math.min(100, lead.score ?? lead.lead_score ?? 0));
}

export function getLeadTemperature(lead: LeadRow): LeadTemperature {
  const value = lead.temperature ?? lead.lead_temperature;
  if (value === 'hot' || value === 'warm' || value === 'cold') return value;
  return createTemperature(getLeadScore(lead));
}

export function getLeadDisplayName(lead: LeadRow): string {
  return lead.name?.trim() || lead.email?.trim() || lead.phone?.trim() || 'Lead sem nome';
}

export function getLeadCompanyName(lead: LeadRow): string | null {
  const metadata = getLeadMetadata(lead);
  return getRecordString(metadata, 'company_name') ?? getRecordString(metadata, 'company');
}

export function getLeadVisitorId(lead: LeadRow): string | null {
  const metadata = getLeadMetadata(lead);
  return getRecordString(metadata, 'visitor_id') ?? lead.external_id ?? null;
}

export async function listLeads(companyId: string, filters: LeadFilters = {}): Promise<LeadRow[]> {
  let request = supabase
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (!filters.includeArchived) {
    request = request.neq('status', 'archived');
  }

  if (filters.status && filters.status !== 'all') {
    request = request.eq('status', filters.status);
  }

  if (filters.temperature && filters.temperature !== 'all') {
    request = request.or(`temperature.eq.${filters.temperature},lead_temperature.eq.${filters.temperature}`);
  }

  if (filters.assignment === 'mine' && filters.currentUserId) {
    request = request.eq('assigned_to', filters.currentUserId);
  } else if (filters.assignment === 'unassigned') {
    request = request.is('assigned_to', null);
  }

  const searchTerm = filters.search ? sanitizeSearchTerm(filters.search) : '';
  if (searchTerm.length >= 2) {
    request = request.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as LeadRow[];
}

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const metadata: Record<string, Json> = {
    created_manually: true,
    created_from: 'lead_list',
  };

  const companyName = normalizeText(input.companyName);
  if (companyName) metadata.company_name = companyName;

  const payload: LeadInsert = {
    company_id: input.companyId,
    name: normalizeText(input.name),
    email: normalizeText(input.email),
    phone: normalizeText(input.phone),
    source: normalizeText(input.source) ?? 'manual',
    status: 'new',
    lead_score: 0,
    score: 0,
    lead_temperature: 'cold',
    temperature: 'cold',
    metadata,
  };

  const { data, error } = await supabase.from('leads').insert(payload).select('*').single();
  if (error) throw error;

  const lead = data as LeadRow;
  await createLeadEvent(lead.id, 'lead_created', 'Lead criado manualmente.', { source: 'lead_list' });
  return lead;
}

export async function getLeadDetails(leadId: string, companyId: string): Promise<LeadDetails | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lead = data as LeadRow;
  const [events, tracking, analysis] = await Promise.all([
    fetchLeadEvents(lead.id),
    fetchLeadTracking(lead),
    fetchLatestAnalysis(lead.id),
  ]);

  return { lead, events, tracking, analysis };
}

export async function updateLeadStatus(input: UpdateLeadStatusInput): Promise<LeadRow> {
  const { data, error } = await supabase
    .from('leads')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.leadId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();

  if (error) throw error;

  await createLeadEvent(input.leadId, 'status_changed', `Status alterado para ${input.status}.`, {
    status: input.status,
  });

  return data as LeadRow;
}

export async function archiveLead(input: ArchiveLeadInput): Promise<LeadRow> {
  const archivedAt = new Date().toISOString();
  const { data: currentLead, error: readError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .eq('company_id', input.companyId)
    .single();

  if (readError) throw readError;

  const metadata: Record<string, Json> = {
    ...getLeadMetadata(currentLead as LeadRow),
    archived_at: archivedAt,
  };

  const { data, error } = await supabase
    .from('leads')
    .update({ status: 'archived', metadata, updated_at: new Date().toISOString() })
    .eq('id', input.leadId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();

  if (error) throw error;

  await createLeadEvent(input.leadId, 'lead_archived', 'Lead arquivado para manter histórico sem exclusão física.', {
    archived_at: archivedAt,
  });

  return data as LeadRow;
}

async function fetchLeadEvents(leadId: string): Promise<LeadEventRow[]> {
  const { data, error } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as LeadEventRow[];
}

async function fetchLeadTracking(lead: LeadRow): Promise<LeadPageView[]> {
  const visitorId = getLeadVisitorId(lead);
  if (!visitorId) return [];

  const { data, error } = await supabase
    .from('page_views')
    .select('id,title,url,created_at,sessions!inner(visitor_id)')
    .eq('sessions.visitor_id', visitorId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) return [];

  return ((data ?? []) as Array<Partial<LeadPageView>>)
    .filter((view): view is LeadPageView => typeof view.id === 'string' && typeof view.url === 'string')
    .map((view) => ({
      id: view.id,
      title: view.title ?? null,
      url: view.url,
      created_at: view.created_at ?? null,
    }));
}

async function fetchLatestAnalysis(leadId: string): Promise<Record<string, Json> | null> {
  const { data, error } = await supabase
    .from('ai_analysis')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as Record<string, Json>;
}

async function createLeadEvent(
  leadId: string,
  eventType: string,
  description: string,
  metadata: Record<string, Json>,
): Promise<void> {
  await supabase.from('lead_events').insert({
    lead_id: leadId,
    event_type: eventType,
    description,
    metadata,
  });
}