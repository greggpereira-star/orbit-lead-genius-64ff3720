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
 
 export const captureService = {
   async submitLead(data: LeadSubmission): Promise<{ success: boolean; leadId?: string }> {
     console.log('Capturing lead:', data);
     // In production, this would call the Supabase Edge Function or Database
     // const { data, error } = await supabase.from('leads').insert(data).select().single();
     
     return new Promise((resolve) => {
       setTimeout(() => {
         resolve({ success: true, leadId: Math.random().toString(36).substr(2, 9) });
       }, 500);
     });
   }
 };