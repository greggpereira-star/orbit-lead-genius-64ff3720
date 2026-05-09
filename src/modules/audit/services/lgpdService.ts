import { supabase } from '@/lib/supabase';

export interface LGPDConsent {
  lead_id: string;
  consent_type: 'marketing' | 'tracking' | 'data_processing';
  status: 'granted' | 'revoked';
  version: string;
  ip_address: string;
  user_agent: string;
}

export const lgpdService = {
  async recordConsent(data: LGPDConsent) {
    const { error } = await supabase.from('lgpd_consents').insert({
      lead_id: data.lead_id,
      consent_type: data.consent_type,
      status: data.status,
      version: data.version,
      metadata: {
        ip: data.ip_address,
        ua: data.user_agent,
        timestamp: new Date().toISOString()
      }
    });

    if (error) throw error;
    
    await supabase.from('audit_logs').insert({
      action: 'consent_recorded',
      entity_type: 'lead',
      entity_id: data.lead_id,
      metadata: { consent_type: data.consent_type, status: data.status }
    });
  },

  async exportData(leadId: string) {
    const { data: lead } = await supabase.from('leads').select('*, lead_events(*), lead_tracking(*)').eq('id', leadId).single();
    return lead;
  },

  async deleteData(leadId: string) {
    // Audit before delete
    await supabase.from('audit_logs').insert({
      action: 'data_erasure_request',
      entity_type: 'lead',
      entity_id: leadId
    });

    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    if (error) throw error;
  }
};
