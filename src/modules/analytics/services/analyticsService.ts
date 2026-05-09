import { supabase } from '@/lib/supabase';

export const analyticsService = {
  async getDashboardStats(companyId: string) {
    // In a real app, this would perform complex SQL aggregations
    return {
      totalLeads: 1284,
      dealsInPipeline: 42500,
      conversionRate: 3.2,
      activeAutomations: 12
    };
  },

  async getConversionFunnel(companyId: string) {
    return [
      { value: 100, name: 'Visits' },
      { value: 60, name: 'Leads' },
      { value: 40, name: 'Qualified' },
      { value: 20, name: 'Deals' },
      { value: 10, name: 'Closed' }
    ];
  }
};
