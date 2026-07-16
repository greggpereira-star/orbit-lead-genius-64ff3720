import { supabase } from '@/lib/supabase';

export interface ChatDepartment {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatOperator {
  id: string;
  company_id: string;
  user_id: string;
  department_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'agent' | 'supervisor' | 'admin';
  status: 'online' | 'away' | 'busy' | 'offline';
  max_concurrent: number;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

const DEPT = 'chat_departments' as never;
const OPS = 'chat_operators' as never;

export const chatTeamService = {
  async listDepartments(companyId: string): Promise<ChatDepartment[]> {
    const { data, error } = await supabase
      .from(DEPT)
      .select('*')
      .eq('company_id' as never, companyId as never)
      .order('created_at' as never, { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ChatDepartment[];
  },

  async createDepartment(input: { companyId: string; name: string; description?: string; color?: string }) {
    const { error } = await supabase.from(DEPT).insert({
      company_id: input.companyId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? '#3b82f6',
    } as never);
    if (error) throw error;
  },

  async updateDepartment(id: string, patch: Partial<Pick<ChatDepartment, 'name' | 'description' | 'color' | 'is_active'>>) {
    const { error } = await supabase.from(DEPT).update(patch as never).eq('id' as never, id as never);
    if (error) throw error;
  },

  async deleteDepartment(id: string) {
    const { error } = await supabase.from(DEPT).delete().eq('id' as never, id as never);
    if (error) throw error;
  },

  async listOperators(companyId: string): Promise<ChatOperator[]> {
    const { data, error } = await supabase
      .from(OPS)
      .select('*')
      .eq('company_id' as never, companyId as never)
      .order('created_at' as never, { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ChatOperator[];
  },

  async upsertOperator(input: {
    companyId: string;
    userId: string;
    displayName?: string;
    departmentId?: string | null;
    role?: 'agent' | 'supervisor' | 'admin';
    maxConcurrent?: number;
  }) {
    const { error } = await supabase.from(OPS).upsert(
      {
        company_id: input.companyId,
        user_id: input.userId,
        display_name: input.displayName ?? null,
        department_id: input.departmentId ?? null,
        role: input.role ?? 'agent',
        max_concurrent: input.maxConcurrent ?? 5,
      } as never,
      { onConflict: 'company_id,user_id' } as never,
    );
    if (error) throw error;
  },

  async updateOperator(id: string, patch: Partial<Pick<ChatOperator, 'display_name' | 'department_id' | 'role' | 'max_concurrent' | 'is_active'>>) {
    const { error } = await supabase.from(OPS).update(patch as never).eq('id' as never, id as never);
    if (error) throw error;
  },

  async setMyStatus(operatorId: string, status: ChatOperator['status']) {
    const { error } = await supabase
      .from(OPS)
      .update({ status, last_seen_at: new Date().toISOString() } as never)
      .eq('id' as never, operatorId as never);
    if (error) throw error;
  },

  async deleteOperator(id: string) {
    const { error } = await supabase.from(OPS).delete().eq('id' as never, id as never);
    if (error) throw error;
  },
};
