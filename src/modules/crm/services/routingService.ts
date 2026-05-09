 import { supabase } from '@/lib/supabase';
 
 export const routingService = {
   async assignLead(leadId: string, companyId: string) {
     // 1. Find active routing config
     const { data: config } = await supabase
       .from('routing_configs')
       .select('id')
       .eq('company_id', companyId)
       .eq('is_active', true)
       .single();
 
     if (!config) return null;
 
     // 2. Find next member (Round Robin - oldest last_assigned_at)
     const { data: member } = await supabase
       .from('routing_members')
       .select('id, user_id')
       .eq('config_id', config.id)
       .eq('is_available', true)
       .order('last_assigned_at', { ascending: true, nullsFirst: true })
       .limit(1)
       .single();
 
     if (!member) return null;
 
     // 3. Update lead and member
     const { error: updateLeadError } = await supabase
       .from('leads')
       .update({ 
         metadata: { assigned_to: member.user_id, assigned_at: new Date().toISOString() } 
       })
       .eq('id', leadId);
 
     if (updateLeadError) throw updateLeadError;
 
     await supabase
       .from('routing_members')
       .update({ last_assigned_at: new Date().toISOString() })
       .eq('id', member.id);
 
     // 4. Log event
     await supabase.from('lead_events').insert({
       lead_id: leadId,
       event_type: 'assignment',
       description: `Lead assigned via Round Robin`,
       metadata: { assigned_to: member.user_id }
     });
 
     return member.user_id;
   }
 };