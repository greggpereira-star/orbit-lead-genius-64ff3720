 import { supabase } from '@/lib/supabase';
 
 export interface CVCRMConfig {
   apiUrl: string;
   token: string;
 }
 
 export const cvcrmService = {
   async syncLead(companyId: string, leadId: string): Promise<{ success: boolean; externalId?: string; error?: any }> {
     // 1. Get lead data
     const { data: lead, error: leadError } = await supabase
       .from('leads')
       .select('*')
       .eq('id', leadId)
       .single();
 
     if (leadError || !lead) return { success: false, error: leadError };
 
     // 2. Get CV.CRM config for company
     const { data: integration, error: intError } = await supabase
       .from('integrations')
       .select('*')
       .eq('company_id', companyId)
       .eq('provider', 'cvcrm')
       .single();
 
     if (intError || !integration) return { success: false, error: 'Integration not configured' };
 
     const config = integration.config as CVCRMConfig;
 
     // 3. Log start of sync
     await supabase.from('audit_logs').insert({
       company_id: companyId,
       user_id: '00000000-0000-0000-0000-000000000000', // System user
       action: 'sync_start',
       entity_type: 'lead',
       entity_id: leadId,
       changes: { provider: 'cvcrm' }
     });
 
     // 4. Mock External API call (Internal API Gateway Simulation)
     console.log(`Syncing lead ${leadId} to CV.CRM at ${config.apiUrl}`);
     
     // Simulation of queue/retry logic
     await new Promise(resolve => setTimeout(resolve, 800));
     
     const success = true; // In a real app, this would be the fetch() result
     
     if (success) {
       const externalId = 'CV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
       
       // 5. Update lead with external ID
       await supabase.from('leads').update({
         metadata: { ...lead.metadata, cv_external_id: externalId }
       }).eq('id', leadId);
 
       await supabase.from('lead_events').insert({
         lead_id: leadId,
         event_type: 'sync',
         description: `Lead synced to CV.CRM with ID ${externalId}`
       });
 
       return { success: true, externalId };
     }
 
     return { success: false, error: 'CV.CRM API Error' };
   }
 };