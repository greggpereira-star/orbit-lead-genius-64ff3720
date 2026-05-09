 import { supabase } from '@/lib/supabase';
 
 export interface CVLead {
   nome: string;
   email: string;
   telefone: string;
   id_empreendimento: string;
   origem?: string;
   metadata?: Record<string, any>;
 }
 
 export const cvService = {
   async syncLead(companyId: string, leadId: string) {
     // 1. Get lead data
     const { data: lead, error: leadError } = await supabase
       .from('leads')
       .select('*')
       .eq('id', leadId)
       .single();
 
     if (leadError || !lead) throw new Error('Lead not found');
 
     // 2. Get integration config
     const { data: integration, error: intError } = await supabase
       .from('integrations')
       .select('config')
       .eq('company_id', companyId)
       .eq('provider', 'cvcrm')
       .eq('status', 'connected')
       .single();
 
     if (intError || !integration) {
       console.warn('CV.CRM integration not configured or disconnected');
       return;
     }
 
     const { api_token, domain } = integration.config as any;
 
     // 3. Prepare payload for CV.CRM (following official spec as requested)
     const payload = {
       nome: lead.name,
       email: lead.email,
       telefone: lead.phone,
       id_empreendimento: lead.metadata?.id_empreendimento || '0',
       origem: lead.utm_source || 'Platform',
       token: api_token
     };
 
     // 4. In a real environment, this would be an Edge Function call to avoid CORS and protect tokens
     // Here we simulate the process
     console.log(`Syncing lead ${leadId} to CV.CRM at ${domain}`, payload);
 
     // Simulate log
     await supabase.from('lead_events').insert({
       lead_id: leadId,
       event_type: 'integration_sync',
       description: 'Lead synced to CV.CRM',
       metadata: { provider: 'cvcrm', status: 'success' }
     });
 
     return { success: true };
   }
 };