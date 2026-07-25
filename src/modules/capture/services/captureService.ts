import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';
import { formScoringService } from './formScoringService';
import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';
import { automationService } from '@/modules/automation/services/automationService';
import { listStages, resolveEntryStage } from '@/modules/crm/services/stageService';

export interface LeadSubmission {
  name: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: string;
  fbclid?: string;
}

export const captureService = {
  async submitLead(
    companyId: string, 
    data: LeadSubmission, 
    trackingData: any = {}
  ): Promise<{ success: boolean; leadId?: string; submissionId?: string; error?: any }> {
    try {
      // 1. Calculate Score based on form rules if form_id is present
      let score = 0;
      let tags: string[] = [];
      let temperature = 'cold';

      if (data.metadata?.form_id) {
        const rules = await formScoringService.getScoringRules(data.metadata.form_id);
        const tempRules = await formScoringService.getTemperatureRules(data.metadata.form_id);
        const scoring = formScoringService.calculateScore(rules, data.metadata.answers || {});
        
        score = scoring.score;
        tags = scoring.tags;
        temperature = scoring.temperature || formScoringService.getTemperature(score, tempRules);
      }

      // 2. Etapa de entrada configurada neste formulário (aba Publicação).
      //    Sem isto o lead nascia com stage_id NULL e ficava invisível no
      //    pipeline, mesmo tendo sido capturado com sucesso.
      let entryStageId: string | null = null;
      try {
        const stages = await listStages(companyId);
        let preferred: string | null = null;
        if (data.metadata?.form_id) {
          const { data: formRow } = await supabase
            .from('forms')
            .select('settings')
            .eq('id', data.metadata.form_id)
            .maybeSingle();
          preferred =
            ((formRow?.settings as Record<string, unknown> | undefined)
              ?.default_stage_id as string | undefined) ?? null;
        }
        entryStageId = resolveEntryStage(stages, preferred)?.id ?? null;
      } catch (e) {
        // Captura não pode falhar por causa da etapa: sem ela o lead aparece
        // em "Sem etapa" no board, que é recuperável. Perder o lead não é.
        logger.warn('Não foi possível resolver a etapa de entrada do lead', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 3. Insert Lead
      const lead = {
        id: crypto.randomUUID(),
        company_id: companyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        utm_source: data.utm_source || trackingData.utm_source,
        utm_medium: data.utm_medium || trackingData.utm_medium,
        utm_campaign: data.utm_campaign || trackingData.utm_campaign,
        gclid: data.gclid || trackingData.gclid,
        fbclid: data.fbclid || trackingData.fbclid,
        metadata: { ...data.metadata, ...trackingData.metadata, tags },
        referrer: trackingData.referrer,
        landing_page: trackingData.landing_page,
        status: 'new',
        stage_id: entryStageId,
        stage_entered_at: new Date().toISOString(),
        score,
        temperature
      };
      const { error: leadError } = await supabase.from('leads').insert(lead);

      if (leadError) throw leadError;

      // 3. Insert Tag rules (persist tags to lead_tags table)
      if (tags.length > 0) {
        await supabase.from('lead_tags').insert(
          tags.map(tag => ({ lead_id: lead.id, tag_name: tag }))
        );
      }

      // 4. Save Final Submission record
      const submissionId = crypto.randomUUID();
      const { error: subError } = await supabase
        .from('form_submissions')
        .insert({
          id: submissionId,
          company_id: companyId,
          form_id: data.metadata?.form_id,
          lead_id: lead.id,
          answers: data.metadata?.answers || {},
          score,
          temperature,
          tags,
          tracking: trackingData
        });
      if (subError) logger.error('CaptureService: form_submissions insert failed', { error: subError.message });

      // 5. Create lead event
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'capture',
        description: `Lead captured with score ${score} (${temperature})`,
        metadata: { submission_id: submissionId }
      });

      // 6. Async actions
      // CV.CRM Sync
      if (data.metadata?.cv_crm_integration) {
        cvcrmService.syncLead(companyId, lead.id).catch(err => {
          logger.error('CaptureService: CV.CRM sync failed', { leadId: lead.id, error: err.message });
        });
      }

      // Automations
      automationService.processTrigger(companyId, {
        type: 'lead_created',
        data: { ...lead, submission_id: submissionId }
      }).catch(console.error);

      return { success: true, leadId: lead.id, submissionId };
    } catch (err: any) {
      logger.error('CaptureService: submitLead failed', { error: err.message, companyId });
      return { success: false, error: err.message };
    }
  }
};
