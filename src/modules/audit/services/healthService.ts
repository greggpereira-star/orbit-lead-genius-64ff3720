import { supabase } from '@/lib/supabase';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    name: string;
    status: 'up' | 'down';
    latency: number;
    last_check: string;
  }[];
}

export const healthService = {
  async getSystemHealth(companyId: string): Promise<SystemHealth> {
    // In a real app, this would check external API endpoints (Meta, Google, CVCRM)
    const services = [
      { name: 'Meta Graph API', status: 'up' as const, latency: 45, last_check: new Date().toISOString() },
      { name: 'Google Ads API', status: 'up' as const, latency: 120, last_check: new Date().toISOString() },
      { name: 'CV.CRM Gateway', status: 'up' as const, latency: 85, last_check: new Date().toISOString() },
      { name: 'AI Qualification Engine', status: 'up' as const, latency: 210, last_check: new Date().toISOString() },
    ];

    const isHealthy = services.every(s => s.status === 'up');

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      services
    };
  },

  async logIntegrationError(companyId: string, service: string, error: any) {
    await supabase.from('integration_logs').insert({
      company_id: companyId,
      integration_name: service,
      status: 'error',
      payload: { error: typeof error === 'string' ? error : JSON.stringify(error) },
      timestamp: new Date().toISOString()
    });
  }
};
