import { supabase } from '@/lib/supabase';
import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';
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

    // Process automations in parallel with error isolation
    await Promise.allSettled(automations.map(async (automation: any) => {
      try {
        await this.executeAutomation(automation, trigger.data);
        
        // Log success safely
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          lead_id: trigger.data.lead_id || trigger.data.id,
          status: 'success',
          output: { trigger_data: trigger.data }
        }).select().maybeSingle();
      } catch (error: any) {
        console.error(`Automation \${automation.id} failed:`, error);
        
        // Log failure safely
        await supabase.from('automation_runs').insert({
          automation_id: automation.id,
          lead_id: trigger.data.lead_id || trigger.data.id,
          status: 'failed',
          error: error.message
        }).select().maybeSingle();
      }
    }));
  },

  async executeAutomation(automation: any, data: any) {
    const { action_type, config } = automation.config || {};

    switch (action_type) {
      case 'sync_cvcrm':
        // LeadFlow One-Way Integration: Ensure data is enriched before delivery
        await cvcrmService.syncLead(automation.company_id, {
          ...data,
          source: data.source || 'LeadFlow Automation',
          lead_score: data.lead_score || 50, // Auto-score if coming from automation
          lead_temperature: 'warm'
        });
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
