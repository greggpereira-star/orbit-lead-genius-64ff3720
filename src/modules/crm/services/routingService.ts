 import { supabase } from '@/lib/supabase';
import { LeadScoreResult } from '@/modules/ai/services/scoring';
 
 export const routingService = {
  async assignLead(leadId: string, companyId: string, score?: LeadScoreResult) {
     // 1. Find active routing config
     const { data: config } = await supabase
       .from('routing_configs')
       .select('id')
       .eq('company_id', companyId)
       .eq('is_active', true)
       .single();
 
     if (!config) return null;
 
    // 2. Intelligence Layer: Route high-score leads to top performers
    let memberQuery = supabase
      .from('routing_members')
      .select('id, user_id, performance_score')
      .eq('config_id', config.id)
      .eq('is_available', true);

    // High value leads (A/B grade) go to high-performance reps (> 80)
    if (score && (score.grade === 'A' || score.grade === 'B')) {
      memberQuery = memberQuery.gte('performance_score', 80);
    }

    const { data: member } = await memberQuery
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