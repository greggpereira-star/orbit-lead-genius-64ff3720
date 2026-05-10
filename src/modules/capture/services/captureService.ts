 import { automationService } from '@/modules/automation/services/automationService';
 import { enrichmentService } from '@/modules/ai/services/enrichment';
 export interface LeadSubmission {
   name: string;
   email?: string;
   phone?: string;
   city?: string;
   metadata?: Record<string, any>;
   utm_source?: string;
   utm_medium?: string;
   utm_campaign?: string;
   gclid?: string;
   fbclid?: string;
 }
 
 import { supabase } from '@/lib/supabase';
 import { calculateLeadScore } from '@/modules/ai/services/scoring';
import { qualificationService } from '@/modules/ai/services/qualification';
  import { routingService } from '@/modules/crm/services/routingService';
  import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';
  
  export const captureService = {
   async submitLead(
     companyId: string, 
     data: LeadSubmission, 
     trackingData: any = {}
   ): Promise<{ success: boolean; leadId?: string; error?: any }> {
     const { data: lead, error } = await supabase
       .from('leads')
       .insert({
         company_id: companyId,
         name: data.name,
         email: data.email,
         phone: data.phone,
         city: data.city,
         utm_source: data.utm_source || trackingData.utm_source,
         utm_medium: data.utm_medium || trackingData.utm_medium,
         utm_campaign: data.utm_campaign || trackingData.utm_campaign,
         gclid: data.gclid || trackingData.gclid,
         fbclid: data.fbclid || trackingData.fbclid,
         metadata: { ...data.metadata, ...trackingData.metadata },
         referrer: trackingData.referrer,
         landing_page: trackingData.landing_page,
         status: 'new',
         temperature: 'cold'
       })
       .select()
       .single();
 
     if (error) return { success: false, error };
     
     // Create initial lead event
     await supabase.from('lead_events').insert({
       lead_id: lead.id,
       event_type: 'capture',
       description: 'Lead captured via form',
       metadata: { source: 'form_builder' }
     });
 
 
      // 1. Calculate AI Score
      const scoreResult = calculateLeadScore({ ...data, ...trackingData });
 
      // 2. Update Lead with Score
      await supabase
        .from('leads')
        .update({ 
          score: scoreResult.totalScore,
          temperature: scoreResult.temperature,
          metadata: { 
            ...data.metadata, 
            ...trackingData.metadata,
            ai_analysis: scoreResult.summary,
            grade: scoreResult.grade
          } 
        })
        .eq('id', lead.id);
 
      // 3. Detailed AI Analysis
      const analysis = await qualificationService.analyzeLead(lead.id, scoreResult);

      // 4. Update Lead with deep analysis
      await supabase
        .from('leads')
        .update({
          metadata: { 
            ...lead.metadata,
            ...analysis,
            ai_summary: analysis.summary,
            buying_intent: analysis.buying_intent
          }
        })
        .eq('id', lead.id);

      // 5. Intelligence-based routing
      await routingService.assignLead(lead.id, companyId, scoreResult);
 
      // 6. Enrich Lead in background
      enrichmentService.enrichLead(lead.id).catch(console.error);
 
       // 7. Trigger automations
       automationService.processTrigger(companyId, {
         type: 'lead_created',
         data: { ...lead, ...trackingData }
       }).catch(console.error);
 
       // 8. Auto-sync to CV.CRM if form metadata says so
       if (data.metadata?.cv_crm_integration) {
         cvcrmService.syncLead(companyId, lead.id).catch(err => {
           logger.error('CaptureService: Auto-sync CV.CRM failed', { leadId: lead.id, error: err.message });
         });
       }
  
       return { success: true, leadId: lead.id };
   }
 };