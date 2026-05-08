export interface TrackingData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_page: string;
  session_id: string;
  timestamp: number;
}

const getOrCreateSessionId = () => {
  let sessionId = sessionStorage.getItem('crm_session_id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('crm_session_id', sessionId);
  }
  return sessionId;
};

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
    landing_page: window.location.pathname + window.location.search,
    session_id: getOrCreateSessionId(),
    timestamp: Date.now(),
  };

  // Log for development
  console.log('[Tracking] Initialized:', data);

  // Store in localStorage for cross-page persistence (Last Touch Attribution)
  if (Object.values(data).some(val => val !== undefined && typeof val === 'string')) {
    if (!localStorage.getItem('tracking_first_touch')) {
      localStorage.setItem('tracking_first_touch', JSON.stringify(data));
    }
    localStorage.setItem('tracking_last_touch', JSON.stringify(data));
    
    // History for multi-touch attribution analysis
    const history = JSON.parse(localStorage.getItem('tracking_history') || '[]');
    history.push(data);
    localStorage.setItem('tracking_history', JSON.stringify(history.slice(-20))); 
  }

  return data;
};

export const getStoredTracking = (): TrackingData | null => {
  const stored = localStorage.getItem('tracking_last_touch');
  return stored ? JSON.parse(stored) : null;
};
