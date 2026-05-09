import { supabase } from '@/lib/supabase';

export const analyticsEngine = {
  async track(companyId: string, eventType: string, entity: { type: string, id: string }, value?: number, metadata = {}) {
    // 1. Log Raw Event
    const { error } = await supabase.from('analytics_events').insert({
      company_id: companyId,
      event_type: eventType,
      entity_type: entity.type,
      entity_id: entity.id,
      value: value,
      metadata: metadata
    });

    if (error) console.error('[AnalyticsEngine] Error tracking event:', error);

    // 2. Async Aggregation (Simulated)
    // Em prod, isto seria um worker processando em lote
    await this.updateSnapshots(companyId, eventType, value);
  },

  async updateSnapshots(companyId: string, eventType: string, value?: number) {
    // Incremental update of snapshots
    // Placeholder para lógica de agregação server-side
    console.log('[AnalyticsEngine] Updating snapshots for:', eventType);
  },

  async getKPIMetrics(companyId: string) {
    // Substitui mocks por agregados reais
    const { data: leads } = await supabase.from('leads').select('count', { count: 'exact' }).eq('company_id', companyId);
    const { data: qualified } = await supabase.from('leads').select('count', { count: 'exact' }).eq('company_id', companyId).eq('temperature', 'hot');
    
    // Cálculo de CPL médio via sync logs
    const { data: costs } = await supabase.from('cvcrm_sync_logs').select('latency_ms').eq('company_id', companyId);

    const avgLatency = (costs && costs.length > 0) 
      ? costs.reduce((acc: number, curr: any) => acc + (curr.latency_ms || 0), 0) / costs.length 
      : 0;

    return {
      totalLeads: leads?.count || 0,
      qualifiedLeads: qualified?.count || 0,
      avgLatency
    };
  }
};
