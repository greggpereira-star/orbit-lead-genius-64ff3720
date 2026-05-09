import { supabase } from '@/lib/supabase';

class EnterpriseTracker {
  private companyId: string | null = null;
  private sessionId: string | null = null;
  private visitorId: string | null = null;
  private _startTime: number | null = null;

  private get startTime(): number {
    if (this._startTime === null) this._startTime = Date.now();
    return this._startTime;
  }
  private maxScroll: number = 0;

  init(companyId: string) {
    this.companyId = companyId;
    this.visitorId = this.getOrCreateVisitorId();
    this.startSession();
    this.setupInteractions();
  }

  private setupInteractions() {
    if (typeof window === 'undefined') return;
    window.addEventListener('scroll', () => {
      const scrolled = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      this.maxScroll = Math.max(this.maxScroll, Math.round(scrolled * 100));
    });
  }

  private getOrCreateVisitorId(): string {
    if (typeof localStorage === 'undefined') return 'server';
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
    const timeOnPage = Math.round((Date.now() - this.startTime) / 1000);
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
      session_id: this.sessionId,
      metadata: {
        time_on_page: timeOnPage,
        scroll_depth: this.maxScroll,
        screen_res: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '0x0',
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown'
      }
    };
  }
}

export const tracker = new EnterpriseTracker();
