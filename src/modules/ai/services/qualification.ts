import { supabase } from '@/lib/supabase';
import { LeadScoreResult } from './scoring';

export interface AIQualification {
  summary: string;
  pain_points: string[];
  buying_intent: 'high' | 'medium' | 'low';
  recommended_next_step: string;
  estimated_deal_value: number;
}

export const qualificationService = {
  async analyzeLead(leadId: string, score: LeadScoreResult): Promise<AIQualification> {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    
    const qualification: AIQualification = {
      summary: `${lead?.name} is showing ${score.temperature} interest. ${score.summary}`,
      pain_points: [
        "Inefficient lead attribution",
        "High cost per lead in Meta Ads",
        "Manual CRM synchronization overhead"
      ],
      buying_intent: score.totalScore > 70 ? 'high' : score.totalScore > 40 ? 'medium' : 'low',
      recommended_next_step: score.totalScore > 70 
        ? "Schedule immediate discovery call with AE"
        : "Add to 'Enterprise Attribution' nurture sequence",
      estimated_deal_value: score.totalScore * 100
    };

    await supabase.from('ai_analysis').insert({
      lead_id: leadId,
      summary: qualification.summary,
      score: score.totalScore,
      metadata: qualification
    });

    return qualification;
  }
};
