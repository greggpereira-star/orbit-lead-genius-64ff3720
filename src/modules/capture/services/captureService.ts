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
 
     return { success: true, leadId: lead.id };
   }
 };