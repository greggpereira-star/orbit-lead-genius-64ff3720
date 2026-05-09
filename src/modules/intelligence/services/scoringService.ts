import { supabase } from '@/lib/supabase';

export const scoringService = {
  /**
   * Calculates lead score based on behavior and attribution.
   * +20 visited pricing
   * +30 clicked whatsapp
   * +15 returns > 2x
   * +25 bottom funnel campaign
   */
  async calculateScore(leadId: string): Promise<number> {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, lead_touchpoints(*)')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) return 0;

    let score = 0;
    const reasons: string[] = [];

    // 1. UTM Attribution Analysis
    if (lead.utm_campaign?.toLowerCase().includes('retargeting')) {
      score += 25;
      reasons.push('Bottom funnel campaign');
    }

    // 2. Behavior Analysis (Touchpoints)
    const touchpoints = lead.lead_touchpoints || [];
    
    const whatsappClicks = touchpoints.filter(t => t.type === 'whatsapp').length;
    if (whatsappClicks > 0) {
      score += 30;
      reasons.push('Clicked WhatsApp');
    }

    const pricingViews = touchpoints.filter(t => t.url?.includes('pricing') || t.url?.includes('financiamento')).length;
    if (pricingViews > 0) {
      score += 20;
      reasons.push('Visited pricing/financing page');
    }

    const sessions = new Set(touchpoints.map(t => t.metadata?.session_id)).size;
    if (sessions > 2) {
      score += 15;
      reasons.push('Returned more than 2x');
    }

    // 3. Update Intelligence Table
    const temperature = score > 70 ? 'hot' : score > 30 ? 'warm' : 'cold';
    
    await supabase.from('lead_intelligence').upsert({
      lead_id: leadId,
      score,
      temperature,
      quality_signals: { reasons },
      last_updated: new Date().toISOString()
    }, { onConflict: 'lead_id' });

    // 4. Update Lead Table
    await supabase.from('leads').update({
      score,
      temperature
    }).eq('id', leadId);

    // 5. Log History
    await supabase.from('lead_score_history').insert({
      lead_id: leadId,
      new_score: score,
      reason: reasons.join(', ')
    });

    return score;
  }
};
