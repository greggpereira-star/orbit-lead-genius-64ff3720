import { supabase } from '@/lib/supabase';
import { healthService } from '@/modules/audit/services/healthService';
import { toast } from 'sonner';

/**
 * CV.CRM Integration Service
 * Follows the principle: Frontend -> API Gateway (Edge Function) -> Queue -> CV.CRM
 */
export const cvcrmService = {
  async saveConfig(companyId: string, config: { cvcrm_base_url: string; api_user: string; api_token: string; subdomain?: string }) {
    try {
      const { error } = await supabase
        .from('cvcrm_integrations')
        .upsert({
          company_id: companyId,
          base_url: config.cvcrm_base_url,
          subdomain: config.subdomain || config.cvcrm_base_url,
          integration_user: config.api_user,
          encrypted_api_token: config.api_token, // Ideally encrypted on EF, but service can pass it
          is_active: true,
          connection_status: 'validating',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Trigger validation via Edge Function (Enterprise spec)
      const { data: testResult, error: testError } = await supabase.functions.invoke('test-cvcrm-connection', {
        body: { tenant_id: companyId }
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
   * Sync a specific lead to CV.CRM (Manual trigger or specific override)
   */
  async syncLead(companyId: string, leadId: string): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('send-cvcrm-lead', {
        body: { lead_id: leadId, tenant_id: companyId, trace_id: crypto.randomUUID() }
      });

      return { success: !functionError && data?.success, data, error: functionError };

    } catch (err: any) {
      console.error('CV.CRM Sync Error:', err);
      return { success: false, error: err.message };
    }
  },

  async sendTestLead(companyId: string): Promise<{ success: boolean; data?: any; error?: any }> {
    try {
      // Create a test lead in Alt Flow
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          name: 'Test Lead Alt Flow',
          email: `test-cvcrm-${Date.now()}@altflow.local`,
          phone: '11999999999',
          source: 'Integration Test',
          utm_source: 'altflow_test',
          utm_campaign: 'cvcrm_connection_test',
          metadata: {
            test_sync: true,
            capture_origin: 'UI-Button'
          }
        })
        .select()
        .single();

      if (leadError) throw leadError;

      // Trigger immediate sync
      return await this.syncLead(companyId, lead.id);
    } catch (err: any) {
      console.error('CV.CRM Test Lead Error:', err);
      return { success: false, error: err.message };
    }
  }
};