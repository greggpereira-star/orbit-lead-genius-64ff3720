 export interface TrackingData {
   utm_source?: string;
   utm_medium?: string;
   utm_campaign?: string;
   utm_content?: string;
   utm_term?: string;
   gclid?: string;
   fbclid?: string;
   referrer?: string;
   timestamp: number;
 }
 
 export const initTracking = (): TrackingData => {
   const urlParams = new URLSearchParams(window.location.search);
   const data: TrackingData = {
     utm_source: urlParams.get('utm_source') || undefined,
     utm_medium: urlParams.get('utm_medium') || undefined,
     utm_campaign: urlParams.get('utm_campaign') || undefined,
     utm_content: urlParams.get('utm_content') || undefined,
     utm_term: urlParams.get('utm_term') || undefined,
     gclid: urlParams.get('gclid') || undefined,
     fbclid: urlParams.get('fbclid') || undefined,
     referrer: document.referrer || undefined,
     timestamp: Date.now(),
   };
 
   // Only store if there are tracking params
   if (Object.values(data).some(val => val !== undefined && typeof val === 'string')) {
     const sessionData = {
       ...data,
       first_touch: localStorage.getItem('tracking_first_touch') 
         ? JSON.parse(localStorage.getItem('tracking_first_touch')!) 
         : data,
       last_touch: data,
     };
 
     if (!localStorage.getItem('tracking_first_touch')) {
       localStorage.setItem('tracking_first_touch', JSON.stringify(data));
     }
     localStorage.setItem('tracking_last_touch', JSON.stringify(data));
     
     // Store in a history array
     const history = JSON.parse(localStorage.getItem('tracking_history') || '[]');
     history.push(data);
     localStorage.setItem('tracking_history', JSON.stringify(history.slice(-10))); // Keep last 10
   }
 
   return data;
 };
 
 export const getStoredTracking = (): TrackingData | null => {
   const stored = localStorage.getItem('tracking_last_touch');
   return stored ? JSON.parse(stored) : null;
 };