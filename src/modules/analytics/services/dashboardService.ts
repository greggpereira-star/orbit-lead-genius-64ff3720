import { supabase } from '@/integrations/supabase/client';

export interface DashboardKpis {
  totalLeads: number;
  leadsThisPeriod: number;
  leadsPrevPeriod: number;
  leadsDelta: number; // %
  hotLeads: number;
  quizSubmissions: number;
  quizCompleted: number;
  quizConversion: number; // %
  metaLeads: number;
  metaTopForms: { name: string; value: number }[];
  metaTopCampaigns: { name: string; value: number }[];
  cvcrmDelivered: number;
  cvcrmFailed: number;
  cvcrmSuccessRate: number; // %
  dailySeries: { date: string; leads: number; submissions: number }[];
  sources: { name: string; value: number }[];
  temperature: { hot: number; warm: number; cold: number };
  whatsapp: {
    clicks: number;
    leadsFromClicks: number;
    conversionRate: number;
    topSources: { name: string; value: number }[];
    topCampaigns: { name: string; value: number }[];
    capi: { sent: number; pending: number; failed: number; deadLetter: number; skipped: number };
  };
  recentLeads: Array<{
    id: string;
    name: string | null;
    source: string | null;
    temperature: string | null;
    score: number | null;
    created_at: string;
  }>;
}

function dayKey(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export const dashboardService = {
  async getKpis(companyId: string, days = 30): Promise<DashboardKpis> {
    const now = Date.now();
    const since = new Date(now - days * 86400000).toISOString();
    const prevSince = new Date(now - days * 2 * 86400000).toISOString();

    const [leadsRes, prevLeadsRes, totalLeadsRes, submissionsRes, metaRes, cvcrmRes, waRes] = await Promise.all([
      supabase
        .from('leads')
        .select('id, name, source, temperature, score, created_at, metadata')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', prevSince)
        .lt('created_at', since),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
      supabase
        .from('quiz_submissions')
        .select('id, status, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since),
      supabase
        .from('meta_lead_events')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', since),
      supabase
        .from('cvcrm_delivery_logs')
        .select('status')
        .eq('company_id', companyId)
        .gte('created_at', since),
      supabase
        .from('whatsapp_click_events')
        .select('id, lead_id, tracking, capi_status, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since),
    ]);

    const leads = (leadsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      source: string | null;
      temperature: string | null;
      score: number | null;
      created_at: string;
      metadata: Record<string, unknown> | null;
    }>;
    const submissions = (submissionsRes.data ?? []) as Array<{ status: string | null; created_at: string }>;
    const cvcrm = (cvcrmRes.data ?? []) as Array<{ status: string | null }>;

    const leadsThisPeriod = leads.length;
    const leadsPrevPeriod = prevLeadsRes.count ?? 0;
    const leadsDelta =
      leadsPrevPeriod > 0 ? ((leadsThisPeriod - leadsPrevPeriod) / leadsPrevPeriod) * 100 : leadsThisPeriod > 0 ? 100 : 0;

    const temperature = { hot: 0, warm: 0, cold: 0 };
    const sourceMap = new Map<string, number>();
    for (const l of leads) {
      if (l.temperature === 'hot') temperature.hot++;
      else if (l.temperature === 'warm') temperature.warm++;
      else if (l.temperature === 'cold') temperature.cold++;
      const s = l.source ?? 'Direto';
      sourceMap.set(s, (sourceMap.get(s) ?? 0) + 1);
    }

    const quizCompleted = submissions.filter((s) => s.status === 'completed').length;
    const quizConversion = submissions.length > 0 ? (quizCompleted / submissions.length) * 100 : 0;

    const cvcrmDelivered = cvcrm.filter((c) => c.status === 'delivered' || c.status === 'success').length;
    const cvcrmFailed = cvcrm.filter((c) => c.status === 'failed' || c.status === 'dead_letter').length;
    const totalCvcrm = cvcrm.length;
    const cvcrmSuccessRate = totalCvcrm > 0 ? (cvcrmDelivered / totalCvcrm) * 100 : 0;

    const bucket = new Map<string, { leads: number; submissions: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = dayKey(new Date(now - i * 86400000));
      bucket.set(d, { leads: 0, submissions: 0 });
    }
    for (const l of leads) {
      const b = bucket.get(dayKey(l.created_at));
      if (b) b.leads++;
    }
    for (const s of submissions) {
      const b = bucket.get(dayKey(s.created_at));
      if (b) b.submissions++;
    }
    const dailySeries = Array.from(bucket.entries()).map(([date, v]) => ({ date, ...v }));

    const sources = Array.from(sourceMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Meta form/campaign breakdown from lead metadata
    const metaFormMap = new Map<string, number>();
    const metaCampaignMap = new Map<string, number>();
    for (const l of leads) {
      if (l.source !== 'meta_leadads') continue;
      const md = (l.metadata ?? {}) as Record<string, unknown>;
      const formName = (md.meta_form_name as string) || (md.meta_form_id as string) || 'Sem formulário';
      metaFormMap.set(formName, (metaFormMap.get(formName) ?? 0) + 1);
      const camp = (md.meta_campaign_id as string) || null;
      if (camp) metaCampaignMap.set(camp, (metaCampaignMap.get(camp) ?? 0) + 1);
    }

    const waEvents = (waRes.data ?? []) as Array<{
      id: string;
      lead_id: string | null;
      tracking: Record<string, string | null> | null;
      capi_status: string | null;
    }>;
    const waLeadsFromClicks = waEvents.filter((e) => !!e.lead_id).length;
    const waSourceMap = new Map<string, number>();
    const waCampaignMap = new Map<string, number>();
    const capi = { sent: 0, pending: 0, failed: 0, deadLetter: 0, skipped: 0 };
    for (const e of waEvents) {
      const src = e.tracking?.utm_source || 'Direto';
      waSourceMap.set(src, (waSourceMap.get(src) ?? 0) + 1);
      const camp = e.tracking?.utm_campaign;
      if (camp) waCampaignMap.set(camp, (waCampaignMap.get(camp) ?? 0) + 1);
      switch (e.capi_status) {
        case 'sent': capi.sent++; break;
        case 'skipped': capi.skipped++; break;
        case 'dead_letter': capi.deadLetter++; break;
        case 'retry': case 'failed': capi.failed++; break;
        default: capi.pending++;
      }
    }
    const sortTop = (m: Map<string, number>) =>
      Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);

    return {
      totalLeads: totalLeadsRes.count ?? 0,
      leadsThisPeriod,
      leadsPrevPeriod,
      leadsDelta,
      hotLeads: temperature.hot,
      quizSubmissions: submissions.length,
      quizCompleted,
      quizConversion,
      metaLeads: metaRes.count ?? 0,
      cvcrmDelivered,
      cvcrmFailed,
      cvcrmSuccessRate,
      dailySeries,
      sources,
      temperature,
      whatsapp: {
        clicks: waEvents.length,
        leadsFromClicks: waLeadsFromClicks,
        conversionRate: waEvents.length > 0 ? (waLeadsFromClicks / waEvents.length) * 100 : 0,
        topSources: sortTop(waSourceMap),
        topCampaigns: sortTop(waCampaignMap),
        capi,
      },
      recentLeads: leads.slice(0, 8),
    };
  },
};
