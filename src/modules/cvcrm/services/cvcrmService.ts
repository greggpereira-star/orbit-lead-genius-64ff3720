import { supabase } from '@/lib/supabase';
import { healthService } from '@/modules/audit/services/healthService';
import { toast } from 'sonner';

/**
 * CV.CRM Integration Service
 * Follows the principle: Frontend -> API Gateway (Edge Function) -> CV.CRM
 */
export const cvcrmService = {
  /**
   * Saves CV.CRM integration settings securely.
   */
  async saveConfig(companyId: string, config: { domain: string; email: string; api_token: string }) {
    try {
      const { error } = await supabase
        .from('integrations')
        .upsert({
          company_id: companyId,
          provider: 'cvcrm',
          status: 'connected',
          config: {
            domain: config.domain,
            email: config.email,
            api_token: config.api_token
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,provider' });

      if (error) throw error;
      
      toast.success('CV.CRM configuration saved successfully');
      return { success: true };
    } catch (err: any) {
      console.error('Error saving CV.CRM config:', err);
      toast.error('Failed to save CV.CRM configuration');
      return { success: false, error: err.message };
    }
  },

  /**
   * Triggers real-time synchronization of a lead to CV.CRM.
   * Uses a Supabase Edge Function to protect tokens and handle integration logic.
   */
  async syncLead(companyId: string, leadId: string): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // 1. Log start of sync for auditability
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        action: 'cvcrm_sync_triggered',
        entity_type: 'lead',
        entity_id: leadId
      });

      // 2. Invoke the Edge Function (Internal API Gateway)
      // This ensures tokens (api_token, email) are never exposed to the client
      const { data, error } = await supabase.functions.invoke('sync-cvcrm', {
        body: { leadId, companyId }
      });

      if (data?.success === false) {
         await healthService.logIntegrationError(companyId, 'cvcrm', data.error);
      }

      if (error) {
        console.error('Edge Function Error:', error);
        
        // Log failure
        await supabase.from('integration_logs').insert({
          company_id: companyId,
          integration_name: 'cvcrm',
          status: 'error',
          payload: { error: error.message, leadId }
        });

        return { success: false, error: error.message };
      }

      // 3. Update local lead with external reference if available
      if (data?.success && data?.data?.id_lead) {
        await supabase
          .from('leads')
          .update({
            metadata: { 
              cv_lead_id: data.data.id_lead,
              last_sync: new Date().toISOString()
            }
          })
          .eq('id', leadId);
      }

      return { success: true, data };

    } catch (err: any) {
      console.error('CV.CRM Sync Exception:', err);
      return { success: false, error: err.message };
    }
  }
};