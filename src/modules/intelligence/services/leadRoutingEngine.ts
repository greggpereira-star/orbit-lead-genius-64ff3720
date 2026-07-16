import { supabase } from '@/integrations/supabase/client';

export type RoutingStrategy = 'round_robin' | 'performance' | 'hybrid';

export interface RoutingConfig {
  id: string;
  company_id: string;
  name: string;
  strategy: RoutingStrategy;
  is_active: boolean;
  fallback_user_id: string | null;
  hot_threshold: number;
  warm_threshold: number;
}

export interface RoutingMember {
  id: string;
  config_id: string;
  company_id: string;
  user_id: string;
  performance_score: number;
  weight: number;
  is_available: boolean;
  last_assigned_at: string | null;
}

export const leadRoutingEngine = {
  async getConfig(companyId: string): Promise<RoutingConfig | null> {
    const { data } = await supabase
      .from('routing_configs' as never)
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle();
    return (data as RoutingConfig | null) ?? null;
  },

  async upsertConfig(companyId: string, patch: Partial<RoutingConfig>): Promise<RoutingConfig> {
    const existing = await this.getConfig(companyId);
    if (existing) {
      const { data, error } = await supabase
        .from('routing_configs' as never)
        .update(patch as never)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as RoutingConfig;
    }
    const { data, error } = await supabase
      .from('routing_configs' as never)
      .insert({ company_id: companyId, ...patch } as never)
      .select('*')
      .single();
    if (error) throw error;
    return data as RoutingConfig;
  },

  async listMembers(configId: string): Promise<RoutingMember[]> {
    const { data, error } = await supabase
      .from('routing_members' as never)
      .select('*')
      .eq('config_id', configId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as RoutingMember[]) ?? [];
  },

  async addMember(companyId: string, configId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('routing_members' as never)
      .insert({ company_id: companyId, config_id: configId, user_id: userId } as never);
    if (error && !String(error.message).includes('duplicate')) throw error;
  },

  async updateMember(id: string, patch: Partial<RoutingMember>): Promise<void> {
    const { error } = await supabase
      .from('routing_members' as never)
      .update(patch as never)
      .eq('id', id);
    if (error) throw error;
  },

  async removeMember(id: string): Promise<void> {
    const { error } = await supabase.from('routing_members' as never).delete().eq('id', id);
    if (error) throw error;
  },

  async assignLead(leadId: string, companyId: string, temperature?: 'hot' | 'warm' | 'cold'): Promise<string | null> {
    const config = await this.getConfig(companyId);
    if (!config) return null;

    const preferTop =
      config.strategy === 'performance' ||
      (config.strategy === 'hybrid' && temperature === 'hot');

    const { data: userId, error } = await supabase.rpc('pick_next_routing_member' as never, {
      p_config_id: config.id,
      p_prefer_top: preferTop,
    } as never);

    const assignee = (userId as string | null) ?? config.fallback_user_id;
    if (!assignee) return null;
    if (error) console.warn('[routing] rpc error', error);

    await supabase.from('leads').update({ assigned_to: assignee } as never).eq('id', leadId);
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: 'lead_assigned',
      description: `Lead atribuído (${config.strategy}${temperature ? ` · ${temperature}` : ''})`,
      metadata: { assigned_to: assignee, strategy: config.strategy, temperature } as never,
    } as never);

    return assignee;
  },
};
