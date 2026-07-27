import { supabase } from '@/lib/supabase';
import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';

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
      
      // Aqui existiam as ações 'google_conversion' e 'meta_capi'.
      //
      // A primeira não enviava nada ao Google: dava console.log e gravava um
      // lead_events dizendo "Conversion uploaded to Google Ads", retornando
      // sucesso. Quem lesse a ficha do lead acreditaria numa conversão que
      // nunca saiu. A segunda rodava no navegador e buscaria o access token da
      // Conversions API para dentro da página.
      //
      // As duas foram substituídas pela medição de verdade: pixel e conversão
      // disparam nas páginas públicas (`usePixelTracking`) no momento em que o
      // contato é capturado, com espelho server-side em `/api/public/pixel-event`.

      case 'slack_notification':
        console.log('Sending Slack notification...', config?.webhook_url);
        // Implementation for Slack webhook
        break;

      default:
        console.warn(`Unknown action type: ${action_type}`);
    }
  }
};
