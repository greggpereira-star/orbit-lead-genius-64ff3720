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