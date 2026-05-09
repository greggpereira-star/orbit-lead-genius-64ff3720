import { supabase } from '@/lib/supabase';
import { healthService } from '@/modules/audit/services/healthService';
import { toast } from 'sonner';

/**
 * CV.CRM Integration Service
 * Follows the principle: Frontend -> API Gateway (Edge Function) -> Queue -> CV.CRM
 */
export const cvcrmService = {
  async saveConfig(companyId: string, config: { cvcrm_base_url: string; api_user: string; api_token: string }) {
    try {
      const { error } = await supabase
        .from('cvcrm_integrations')
        .upsert({
          company_id: companyId,
          cvcrm_base_url: config.cvcrm_base_url,
          api_user: config.api_user,
          api_token: config.api_token,
          is_active: true,
          connection_status: 'validating',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Trigger validation via Edge Function
      const { data: testResult, error: testError } = await supabase.functions.invoke('test-cvcrm', {
        body: { companyId }
      });

      if (testError || !testResult?.success) {
        await supabase
          .from('cvcrm_integrations')
          .update({ connection_status: 'failed' })
          .eq('company_id', companyId);
        
        throw new Error(testResult?.error || testError?.message || 'Connection test failed');
      }

      await supabase
        .from('cvcrm_integrations')
        .update({ connection_status: 'connected', last_health_check: new Date().toISOString() })
        .eq('company_id', companyId);

      await supabase.from('integrations').upsert({
        company_id: companyId,
        provider: 'cvcrm',
        status: 'connected',
        config: { domain: config.cvcrm_base_url },
        last_sync_at: new Date().toISOString()
      }, { onConflict: 'company_id,provider' });

      toast.success('CV.CRM connection successful');
      return { success: true };
    } catch (err: any) {
      console.error('Error saving CV.CRM config:', err);
      toast.error(err.message || 'Failed to save CV.CRM configuration');
      return { success: false, error: err.message };
    }
  },

  async getStatus(companyId: string) {
    const { data, error } = await supabase
      .from('cvcrm_integrations')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    
    if (error) return null;
    return data;
  },

  async syncLead(companyId: string, lead: any): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // 1. Persist Lead with full enrichment
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .upsert({
          company_id: companyId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          source: lead.source || 'Direct',
          utm_source: lead.utm_source,
          utm_medium: lead.utm_medium,
          utm_campaign: lead.utm_campaign,
          utm_content: lead.utm_content,
          utm_term: lead.utm_term,
          gclid: lead.gclid,
          fbclid: lead.fbclid,
          landing_page: lead.landing_page,
          device_info: lead.device_info,
          lead_score: lead.lead_score || 0,
          lead_temperature: lead.lead_temperature || 'cold',
          sync_status: 'pending'
        })
        .select()
        .single();

      if (leadError) throw leadError;

      // 2. Add to Queue
      const { error: queueError } = await supabase
        .from('cvcrm_sync_queue')
        .insert({
          company_id: companyId,
          entity_type: 'lead',
          entity_id: leadData.id,
          status: 'pending'
        });

      if (queueError) throw queueError;

      // 3. Trigger Edge Function for real-time delivery
      const { data, error: functionError } = await supabase.functions.invoke('sync-cvcrm', {
        body: { leadId: leadData.id, companyId }
      });

      return { success: !functionError && data?.success, data, error: functionError };

    } catch (err: any) {
      console.error('CV.CRM Sync Error:', err);
      return { success: false, error: err.message };
    }
  }
};