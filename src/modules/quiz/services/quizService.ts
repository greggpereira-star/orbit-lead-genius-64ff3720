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

  async getById(id: string): Promise<QuizFunnel | null> {
    const { data, error } = await supabase.from('quiz_funnels').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as unknown as QuizFunnel) ?? null;
  },

  async getLatestSchema(quizId: string): Promise<QuizSchema> {
    const { data, error } = await supabase
      .from('quiz_versions')
      .select('schema')
      .eq('quiz_id', quizId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const raw = (data?.schema ?? {}) as Partial<QuizSchema>;
    return {
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
  },

  async saveSchema(params: {
    quizId: string;
    companyId: string;
    userId: string;
    schema: QuizSchema;
  }): Promise<void> {
    const { data: latest } = await supabase
      .from('quiz_versions')
      .select('version')
      .eq('quiz_id', params.quizId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((latest as { version?: number } | null)?.version ?? 0) + 1;

    const { error } = await supabase.from('quiz_versions').insert({
      quiz_id: params.quizId,
      company_id: params.companyId,
      version: nextVersion,
      schema: params.schema as never,
      created_by: params.userId,
    });
    if (error) throw error;

    await supabase
      .from('quiz_funnels')
      .update({ design: params.schema.design as never, updated_at: new Date().toISOString() })
      .eq('id', params.quizId);
  },

  // ============ PUBLIC PLAYER (anon) ============
  async getPublishedBySlug(slug: string): Promise<{ quiz: QuizFunnel; schema: QuizSchema } | null> {
    const { data: quiz, error } = await supabase
      .from('quiz_funnels')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error) throw error;
    if (!quiz) return null;

    const publishedVersionId = (quiz as { published_version_id: string | null }).published_version_id;
    let versionQuery = supabase.from('quiz_versions').select('schema').eq('quiz_id', (quiz as { id: string }).id);
    if (publishedVersionId) {
      versionQuery = versionQuery.eq('id', publishedVersionId);
    } else {
      versionQuery = versionQuery.order('version', { ascending: false }).limit(1);
    }
    const { data: version } = await versionQuery.maybeSingle();
    const raw = ((version?.schema ?? {}) as Partial<QuizSchema>);
    const schema: QuizSchema = {
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
    return { quiz: quiz as unknown as QuizFunnel, schema };
  },

  async publish(quizId: string): Promise<void> {
    const { data: latest } = await supabase
      .from('quiz_versions')
      .select('id')
      .eq('quiz_id', quizId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase
      .from('quiz_funnels')
      .update({
        status: 'published',
        published_version_id: (latest as { id?: string } | null)?.id ?? null,
        published_at: new Date().toISOString(),
      })
      .eq('id', quizId);
  },

  async submitPublic(params: {
    quizId: string;
    companyId: string;
    responses: Record<string, unknown>;
    score: number;
    tags: string[];
    temperature: 'hot' | 'warm' | 'cold';
    email?: string;
    phone?: string;
    name?: string;
  }): Promise<string | null> {
    const payload = {
      quiz_id: params.quizId,
      company_id: params.companyId,
      responses: params.responses,
      score: params.score,
      tags: params.tags,
      temperature: params.temperature,
      email: params.email ?? null,
      phone: params.phone ?? null,
      name: params.name ?? null,
      completed: true,
      completed_at: new Date().toISOString(),
    } as never;
    const { data, error } = await supabase
      .from('quiz_submissions')
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return (data as { id?: string } | null)?.id ?? null;
  },

  async trackEvent(params: {
    quizId: string;
    companyId: string;
    submissionId?: string | null;
    eventType: string;
    blockId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await supabase.from('quiz_events').insert({
      quiz_id: params.quizId,
      company_id: params.companyId,
      submission_id: params.submissionId ?? null,
      event_type: params.eventType,
      block_id: params.blockId ?? null,
      metadata: (params.metadata ?? {}) as never,
    });
  },
};
