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
 import { routingService } from '@/modules/crm/services/routingService';
 
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
 
      // 3. Auto-route lead
      await routingService.assignLead(lead.id, companyId);
 
      return { success: true, leadId: lead.id };
   }
 };