import { supabase } from '@/lib/supabase';

export const attributionService = {
  /**
   * Processes attribution for a lead based on touchpoints.
   */
  async processAttribution(leadId: string) {
    const { data: touchpoints, error } = await supabase
      .from('lead_touchpoints')
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: true });

    if (error || !touchpoints || touchpoints.length === 0) return;

    const firstTouch = touchpoints[0];
    const lastTouch = touchpoints[touchpoints.length - 1];
    const conversionTouch = touchpoints.find((t: any) => t.type === 'form_submit') || lastTouch;

    await supabase.from('lead_attribution').upsert({
      lead_id: leadId,
      first_touch_id: firstTouch.id,
      last_touch_id: lastTouch.id,
      conversion_touch_id: conversionTouch.id,
      attribution_model: 'linear',
      data: {
        all_touchpoints: touchpoints.length,
        sources: Array.from(new Set(touchpoints.map((t: any) => t.source).filter(Boolean)))
      }
    }, { onConflict: 'lead_id' });

    // Update lead with primary attribution
    await supabase.from('leads').update({
      utm_source: firstTouch.source,
      utm_medium: firstTouch.medium,
      utm_campaign: firstTouch.campaign,
      gclid: firstTouch.metadata?.gclid,
      fbclid: firstTouch.metadata?.fbclid
    }).eq('id', leadId);
  }
};
