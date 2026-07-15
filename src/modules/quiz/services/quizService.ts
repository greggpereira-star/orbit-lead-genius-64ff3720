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
    const answers = {
      ...params.responses,
      _contact: {
        email: params.email ?? null,
        phone: params.phone ?? null,
        name: params.name ?? null,
      },
    };
    const payload = {
      quiz_id: params.quizId,
      company_id: params.companyId,
      answers,
      score: params.score,
      tags: params.tags,
      temperature: params.temperature,
      status: 'completed',
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
      metadata: params.metadata ?? {},
    } as never);
  },

  // ============ ANALYTICS ============
  async getMetrics(quizId: string, days = 30): Promise<{
    starts: number;
    completions: number;
    submissions: number;
    conversionRate: number;
    avgScore: number;
    temperature: { hot: number; warm: number; cold: number };
    dailySeries: { date: string; starts: number; completions: number }[];
    dropOffByBlock: { blockId: string; views: number }[];
    leadsCaptured: number;
  }> {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [{ data: events }, { data: subs }] = await Promise.all([
      supabase
        .from('quiz_events')
        .select('event_type, block_id, created_at')
        .eq('quiz_id', quizId)
        .gte('created_at', since),
      supabase
        .from('quiz_submissions')
        .select('id, score, temperature, email, phone, completed, created_at')
        .eq('quiz_id', quizId)
        .gte('created_at', since),
    ]);

    const evs = (events ?? []) as Array<{ event_type: string; block_id: string | null; created_at: string }>;
    const subsData = (subs ?? []) as Array<{
      score: number | null;
      temperature: string | null;
      email: string | null;
      phone: string | null;
      completed: boolean | null;
      created_at: string;
    }>;

    const starts = evs.filter((e) => e.event_type === 'start').length;
    const completions = evs.filter((e) => e.event_type === 'complete').length;
    const submissions = subsData.length;
    const leadsCaptured = subsData.filter((s) => s.email || s.phone).length;
    const conversionRate = starts > 0 ? (completions / starts) * 100 : 0;
    const scored = subsData.filter((s) => typeof s.score === 'number');
    const avgScore = scored.length > 0 ? scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length : 0;

    const temperature = { hot: 0, warm: 0, cold: 0 };
    for (const s of subsData) {
      if (s.temperature === 'hot') temperature.hot++;
      else if (s.temperature === 'warm') temperature.warm++;
      else if (s.temperature === 'cold') temperature.cold++;
    }

    const dayMap = new Map<string, { starts: number; completions: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dayMap.set(d, { starts: 0, completions: 0 });
    }
    for (const e of evs) {
      const d = e.created_at.slice(0, 10);
      const bucket = dayMap.get(d);
      if (!bucket) continue;
      if (e.event_type === 'start') bucket.starts++;
      else if (e.event_type === 'complete') bucket.completions++;
    }
    const dailySeries = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

    const blockViews = new Map<string, number>();
    for (const e of evs) {
      if (e.event_type !== 'block_view' || !e.block_id) continue;
      blockViews.set(e.block_id, (blockViews.get(e.block_id) ?? 0) + 1);
    }
    const dropOffByBlock = Array.from(blockViews.entries())
      .map(([blockId, views]) => ({ blockId, views }))
      .sort((a, b) => b.views - a.views);

    return {
      starts,
      completions,
      submissions,
      conversionRate,
      avgScore,
      temperature,
      dailySeries,
      dropOffByBlock,
      leadsCaptured,
    };
  },

  async listSubmissions(quizId: string, limit = 100): Promise<Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    score: number | null;
    temperature: string | null;
    completed: boolean | null;
    created_at: string;
  }>> {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select('id, name, email, phone, score, temperature, completed, created_at')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as never;
  },
};
