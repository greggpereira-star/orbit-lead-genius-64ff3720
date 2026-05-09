 import { supabase } from '@/lib/supabase';
 
 export const metaCapiService = {
   async sendLeadEvent(companyId: string, leadData: any) {
     const { data: integration } = await supabase
       .from('integrations')
       .select('config')
       .eq('company_id', companyId)
       .eq('provider', 'meta')
       .eq('status', 'connected')
       .single();
 
     if (!integration) return;
 
     const { pixel_id, access_token } = integration.config as any;
     if (!pixel_id || !access_token) return;
 
     const hashedEmail = leadData.email ? await hashData(leadData.email) : undefined;
     const hashedPhone = leadData.phone ? await hashData(leadData.phone) : undefined;
 
     const event: CAPIEvent = {
       event_name: 'Lead',
       event_time: Math.floor(Date.now() / 1000),
       user_data: {
         em: hashedEmail ? [hashedEmail] : [],
         ph: hashedPhone ? [hashedPhone] : [],
         client_ip_address: leadData.metadata?.ip,
         client_user_agent: leadData.metadata?.user_agent,
         fbc: leadData.fbclid,
       },
       action_source: 'website',
       event_source_url: window.location.href,
     };
 
     return await sendCAPIEvent(event, pixel_id, access_token);
   }
 };
 
 export interface CAPIEvent {
   event_name: 'Lead' | 'Contact' | 'PageView' | 'CompleteRegistration';
   event_time: number;
   user_data: {
     em?: string[]; // SHA256 hashed emails
     ph?: string[]; // SHA256 hashed phones
     client_ip_address?: string;
     client_user_agent?: string;
     fbc?: string;
     fbp?: string;
   };
   custom_data?: {
     value?: number;
     currency?: string;
     lead_event_source?: string;
     content_name?: string;
   };
   event_source_url?: string;
   action_source: 'website' | 'system_generated' | 'physical_store';
 }
 
 export async function sendCAPIEvent(event: CAPIEvent, pixelId: string, accessToken: string) {
   const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
   
   try {
     const response = await fetch(url, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         data: [event],
       }),
     });
     
     return await response.json();
   } catch (error) {
     console.error('Error sending CAPI event:', error);
     throw error;
   }
 }
 
 export async function hashData(data: string): Promise<string> {
   const msgUint8 = new TextEncoder().encode(data.trim().toLowerCase());
   const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
 }