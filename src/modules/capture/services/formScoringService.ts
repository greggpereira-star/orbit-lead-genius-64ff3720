import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

export interface ScoringRule {
  id: string;
  company_id: string;
  form_id: string;
  step_id?: string;
  field_id?: string;
  rule_type: string;
  condition: any;
  score_delta: number;
  tag_to_apply?: string;
  temperature_override?: string;
  recommended_action?: string;
  enabled: boolean;
}

export interface TemperatureRule {
  id: string;
  company_id: string;
  form_id: string;
  name: string;
  min_score: number;
  max_score: number;
  color?: string;
  priority: number;
}

export const formScoringService = {
  async getScoringRules(formId: string): Promise<ScoringRule[]> {
    const { data, error } = await supabase
      .from('form_scoring_rules')
      .select('*')
      .eq('form_id', formId)
      .eq('enabled', true);
    
    if (error) {
      logger.error('Failed to fetch scoring rules', { error, formId });
      throw error;
    }
    return data || [];
  },

  async getTemperatureRules(formId: string): Promise<TemperatureRule[]> {
    const { data, error } = await supabase
      .from('form_temperature_rules')
      .select('*')
      .eq('form_id', formId)
      .order('priority', { ascending: false });
    
    if (error) {
      logger.error('Failed to fetch temperature rules', { error, formId });
      throw error;
    }
    return data || [];
  },

  calculateScore(rules: ScoringRule[], answers: Record<string, any>): { score: number, tags: string[], temperature?: string } {
    let totalScore = 0;
    const tags = new Set<string>();
    let tempOverride: string | undefined;

    for (const rule of rules) {
      let match = false;
      const answer = answers[rule.field_id || ''];

      switch (rule.rule_type) {
        case 'answer_equals':
          match = answer === rule.condition.value;
          break;
        case 'answer_contains':
          match = String(answer || '').includes(rule.condition.value);
          break;
        case 'number_greater_than':
          match = Number(answer) > Number(rule.condition.value);
          break;
        case 'field_completed':
          match = !!answer;
          break;
        // Add more types as needed
      }

      if (match) {
        totalScore += rule.score_delta;
        if (rule.tag_to_apply) tags.add(rule.tag_to_apply);
        if (rule.temperature_override) tempOverride = rule.temperature_override;
      }
    }

    return { 
      score: totalScore, 
      tags: Array.from(tags), 
      temperature: tempOverride 
    };
  },

  getTemperature(score: number, rules: TemperatureRule[]): string {
    const rule = rules.find(r => score >= r.min_score && score <= r.max_score);
    return rule ? rule.name : 'cold';
  }
};
