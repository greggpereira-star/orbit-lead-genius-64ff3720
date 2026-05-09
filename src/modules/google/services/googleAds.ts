 import { supabase } from '@/lib/supabase';
 
 export interface GoogleConversion {
   gclid: string;
   conversion_name: string;
   conversion_time: string;
   conversion_value?: number;
   currency_code?: string;
 }
 
 export const googleAdsService = {
   async uploadConversion(companyId: string, conversion: GoogleConversion) {
     const { data: integration } = await supabase
       .from('integrations')
       .select('config')
       .eq('company_id', companyId)
       .eq('provider', 'google')
       .eq('status', 'connected')
       .single();
 
     if (!integration) {
       console.warn('Google Ads integration not found');
       return null;
     }
 
     const { customer_id, api_key } = integration.config as any;
 
     // This would typically call a Google Ads API endpoint via an Edge Function
     console.log(`Uploading conversion for ${customer_id}:`, conversion);
 
     await supabase.from('lead_events').insert({
       event_type: 'google_conversion',
       description: `Conversion uploaded to Google Ads: ${conversion.conversion_name}`,
       metadata: { ...conversion, provider: 'google' }
     });
 
     return { success: true };
   }
 };