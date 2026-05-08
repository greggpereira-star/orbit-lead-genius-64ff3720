 export interface LeadSubmission {
   name: string;
   email?: string;
   phone?: string;
   city?: string;
   metadata?: Record<string, any>;
   utm_source?: string;
   utm_medium?: string;
   utm_campaign?: string;
   gclid?: string;
   fbclid?: string;
 }
 
 export const captureService = {
   async submitLead(data: LeadSubmission): Promise<{ success: boolean; leadId?: string }> {
     console.log('Capturing lead:', data);
     // In production, this would call the Supabase Edge Function or Database
     // const { data, error } = await supabase.from('leads').insert(data).select().single();
     
     return new Promise((resolve) => {
       setTimeout(() => {
         resolve({ success: true, leadId: Math.random().toString(36).substr(2, 9) });
       }, 500);
     });
   }
 };
 
 *** Add File: src/core/tracking/pixel.ts
 export const trackingPixel = {
   init() {
     console.log('Tracking Pixel initialized');
     this.captureUTMs();
   },
 
   captureUTMs() {
     const params = new URLSearchParams(window.location.search);
     const utms = {
       utm_source: params.get('utm_source'),
       utm_medium: params.get('utm_medium'),
       utm_campaign: params.get('utm_campaign'),
       gclid: params.get('gclid'),
       fbclid: params.get('fbclid'),
     };
 
     // Store in session storage for later use in forms
     Object.entries(utms).forEach(([key, value]) => {
       if (value) {
         sessionStorage.setItem(`tracking_${key}`, value);
       }
     });
 
     return utms;
   },
 
   getStoredUTMs() {
     return {
       utm_source: sessionStorage.getItem('tracking_utm_source'),
       utm_medium: sessionStorage.getItem('tracking_utm_medium'),
       utm_campaign: sessionStorage.getItem('tracking_utm_campaign'),
       gclid: sessionStorage.getItem('tracking_utm_gclid'),
       fbclid: sessionStorage.getItem('tracking_utm_fbclid'),
     };
   }
 };