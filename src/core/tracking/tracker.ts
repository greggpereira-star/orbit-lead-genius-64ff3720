 import { supabase } from '@/lib/supabase';
 
 class EnterpriseTracker {
   private companyId: string | null = null;
   private sessionId: string | null = null;
   private visitorId: string | null = null;
 
   init(companyId: string) {
     this.companyId = companyId;
     this.visitorId = this.getOrCreateVisitorId();
     this.startSession();
   }
 
   private getOrCreateVisitorId(): string {
     let id = localStorage.getItem('ent_visitor_id');
     if (!id) {
       id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
       localStorage.setItem('ent_visitor_id', id);
     }
     return id;
   }
 
   private async startSession() {
     if (!this.companyId || !this.visitorId) return;
 
     const urlParams = new URLSearchParams(window.location.search);
     const utmData = {
       utm_source: urlParams.get('utm_source'),
       utm_medium: urlParams.get('utm_medium'),
       utm_campaign: urlParams.get('utm_campaign'),
       gclid: urlParams.get('gclid'),
       fbclid: urlParams.get('fbclid'),
     };
 
     const { data, error } = await supabase
       .from('sessions')
       .insert({
         company_id: this.companyId,
         visitor_id: this.visitorId,
         ...utmData
       })
       .select()
       .single();
 
     if (data) {
       this.sessionId = data.id;
       this.trackPageView();
     }
   }
 
   async trackPageView() {
     if (!this.sessionId) return;
 
     await supabase.from('page_views').insert({
       session_id: this.sessionId,
       url: window.location.href,
       title: document.title,
     });
   }
 
   getTrackingParams() {
     const urlParams = new URLSearchParams(window.location.search);
     return {
       utm_source: urlParams.get('utm_source'),
       utm_medium: urlParams.get('utm_medium'),
       utm_campaign: urlParams.get('utm_campaign'),
       gclid: urlParams.get('gclid'),
       fbclid: urlParams.get('fbclid'),
       referrer: document.referrer,
       landing_page: window.location.pathname,
       visitor_id: this.visitorId,
       session_id: this.sessionId
     };
   }
 }
 
 export const tracker = new EnterpriseTracker();