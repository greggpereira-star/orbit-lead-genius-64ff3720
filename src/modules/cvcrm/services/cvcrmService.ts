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

  /**
   * Triggers real-time synchronization of a lead to CV.CRM.
   * Uses a Supabase Edge Function to protect tokens and handle integration logic.
   */
  async syncLead(companyId: string, leadId: string): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // 1. Log sync request
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        action: 'cvcrm_sync_triggered',
        entity_type: 'lead',
        entity_id: leadId
      });

      // 2. Add to Queue (Event-Driven)
      const { error: queueError } = await supabase
        .from('cvcrm_sync_queue')
        .insert({
          company_id: companyId,
          entity_type: 'lead',
          entity_id: leadId,
          status: 'pending'
        });

      if (queueError) throw queueError;

      // 3. Optional: Trigger immediate processing via Edge Function
      const { data, error } = await supabase.functions.invoke('sync-cvcrm', {
        body: { leadId, companyId }
      });

      return { success: !error && data?.success, data, error };

    } catch (err: any) {
      console.error('CV.CRM Sync Error:', err);
      await healthService.logIntegrationError(companyId, 'cvcrm', err.message);
      return { success: false, error: err.message };
    }
  }
};