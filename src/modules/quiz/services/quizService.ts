import { supabase } from '@/integrations/supabase/client';
import type { QuizFunnel, QuizTemplate, QuizSchema } from '../types';
import { DEFAULT_DESIGN } from '../design-presets';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'quiz';
}

export const quizService = {
  async list(companyId: string): Promise<QuizFunnel[]> {
    const { data, error } = await supabase
      .from('quiz_funnels')
      .select('*')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as QuizFunnel[];
  },

  async listTemplates(): Promise<QuizTemplate[]> {
    const { data, error } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as QuizTemplate[];
  },

  async create(params: {
    companyId: string;
    userId: string;
    name: string;
    niche?: string;
    templateSchema?: Record<string, unknown>;
  }): Promise<QuizFunnel> {
    const baseSlug = slugify(params.name);
    // Try slug, then slug-2, slug-3, ...
    let finalSlug = baseSlug;
    for (let i = 2; i < 20; i++) {
      const { data: exists } = await supabase
        .from('quiz_funnels')
        .select('id')
        .eq('company_id', params.companyId)
        .eq('slug', finalSlug)
        .maybeSingle();
      if (!exists) break;
      finalSlug = `${baseSlug}-${i}`;
    }

    const { data, error } = await supabase
      .from('quiz_funnels')
      .insert({
        company_id: params.companyId,
        created_by: params.userId,
        name: params.name,
        slug: finalSlug,
        niche: params.niche ?? null,
        status: 'draft',
        design: ((params.templateSchema?.design as Record<string, unknown>) ?? {}) as never,
        settings: {} as never,
      })
      .select('*')
      .single();
    if (error) throw error;

    // Create initial version with template schema
    await supabase.from('quiz_versions').insert({
      quiz_id: (data as { id: string }).id,
      company_id: params.companyId,
      version: 1,
      schema: (params.templateSchema ?? { blocks: [], results: [], design: {} }) as never,
      created_by: params.userId,
    });

    return data as unknown as QuizFunnel;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('quiz_funnels').delete().eq('id', id);
    if (error) throw error;
  },
};
