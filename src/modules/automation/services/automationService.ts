import { supabase } from '@/lib/supabase';
import { cvService } from '@/modules/cvcrm/services/cvService';
import { googleAdsService } from '@/modules/google/services/googleAds';
import { metaCapiService } from '@/modules/meta/services/capi';

export interface AutomationTrigger {
  type: 'lead_created' | 'stage_changed' | 'score_threshold';
  data: any;
}

export const automationService = {
  async processTrigger(companyId: string, trigger: AutomationTrigger) {
    console.log(`Processing trigger: ${trigger.type} for company ${companyId}`);

    // 1. Fetch active automations for this trigger type
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('company_id', companyId)
      .eq('trigger_type', trigger.type)
      .eq('is_active', true);

    if (!automations || automations.length === 0) return;

    for (const automation of automations) {
      try {
        await this.executeAutomation(automation, trigger.data);
        
        // Log success
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          lead_id: trigger.data.lead_id || trigger.data.id,
          status: 'success',
          output: { trigger_data: trigger.data }
        });
      } catch (error: any) {
        console.error(`Automation ${automation.id} failed:`, error);
        
        // Log failure
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          lead_id: trigger.data.lead_id || trigger.data.id,
          status: 'failed',
          error: error.message
        });
      }
    }
  },

  async executeAutomation(automation: any, data: any) {
    const { action_type, config } = automation.config || {};

    switch (action_type) {
      case 'sync_cvcrm':
        await cvService.syncLead(automation.company_id, data.id);
        break;
      
      case 'google_conversion':
        if (data.gclid) {
          await googleAdsService.uploadConversion(automation.company_id, {
            gclid: data.gclid,
            conversion_name: config?.conversion_name || 'Lead',
            conversion_time: new Date().toISOString()
          });
        }
        break;

      case 'meta_capi':
        await metaCapiService.sendLeadEvent(automation.company_id, data);
        break;

      case 'slack_notification':
        console.log('Sending Slack notification...', config?.webhook_url);
        // Implementation for Slack webhook
        break;

      default:
        console.warn(`Unknown action type: ${action_type}`);
    }
  }
};
