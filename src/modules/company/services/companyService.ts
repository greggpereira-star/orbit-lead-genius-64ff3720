import { supabase } from '@/integrations/supabase/client';
import { SUBDOMAIN_FORMAT, RESERVED_SUBDOMAINS } from '@/modules/quiz/lib/tenant';

export interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
}

export const companyService = {
  async getById(companyId: string): Promise<CompanyRecord | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, slug, subdomain')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as CompanyRecord | null;
  },

  async updateSubdomain(params: { companyId: string; subdomain: string }): Promise<CompanyRecord> {
    const normalized = params.subdomain.trim().toLowerCase();
    if (normalized && !SUBDOMAIN_FORMAT.test(normalized)) {
      throw new Error('Use só letras minúsculas, números e hífen (3 a 30 caracteres, sem começar ou terminar com hífen).');
    }
    if (normalized && RESERVED_SUBDOMAINS.has(normalized)) {
      throw new Error('Esse subdomínio é reservado pelo sistema. Escolha outro.');
    }
    const { data, error } = await supabase
      .from('companies')
      .update({ subdomain: normalized || null })
      .eq('id', params.companyId)
      .select('id, name, slug, subdomain')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('Esse subdomínio já está em uso por outra conta.');
      }
      throw error;
    }
    return data as CompanyRecord;
  },
};
