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