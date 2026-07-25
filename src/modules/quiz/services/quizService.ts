import { supabase } from '@/integrations/supabase/client';
import type { QuizFunnel, QuizTemplate, QuizSchema, AccessRules, SocialProofSettings, UrgencyBarSettings } from '../types';
import { DEFAULT_DESIGN } from '../design-presets';
import { DEFAULT_ACCESS_RULES } from '../types';
import { parseSubdomain } from '../lib/tenant';
import { resolveEntryStageId, newLeadBoardOrder } from '@/modules/crm/services/stageService';

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

function parseUserAgent(ua: string): { device: string; browser: string } {
  const isTablet = /iPad|Tablet/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod/i.test(ua);
  const device = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';
  let browser = 'Outro';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return { device, browser };
}

async function findUniqueSlug(companyId: string, baseSlug: string, excludeId?: string): Promise<string> {
  let finalSlug = baseSlug;
  for (let i = 2; i < 20; i++) {
    let query = supabase
      .from('quiz_funnels')
      .select('id')
      .eq('company_id', companyId)
      .eq('slug', finalSlug);
    if (excludeId) query = query.neq('id', excludeId);
    const { data: exists } = await query.maybeSingle();
    if (!exists) break;
    finalSlug = `${baseSlug}-${i}`;
  }
  return finalSlug;
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

  async updateSettings(params: {
    quizId: string;
    companyId: string;
    name?: string;
    slug?: string;
    customDomain?: string;
    webhookUrl?: string;
    customHeadScript?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoOgImage?: string;
    socialProof?: SocialProofSettings;
    urgencyBar?: UrgencyBarSettings;
    /** Etapa do pipeline onde o lead deste quiz entra. `null` = padrão do funil. */
    defaultStageId?: string | null;
  }): Promise<QuizFunnel> {
    const patch: Record<string, unknown> = {};

    if (params.name !== undefined) {
      const trimmed = params.name.trim();
      if (!trimmed) throw new Error('Nome do quiz não pode ficar vazio');
      patch.name = trimmed;
    }

    if (params.slug !== undefined) {
      const desired = slugify(params.slug);
      patch.slug = await findUniqueSlug(params.companyId, desired, params.quizId);
    }

    const settingsFields: [keyof typeof params, string][] = [
      ['customDomain', 'custom_domain'],
      ['webhookUrl', 'webhook_url'],
      ['customHeadScript', 'custom_head_script'],
      ['seoTitle', 'seo_title'],
      ['seoDescription', 'seo_description'],
      ['seoOgImage', 'seo_og_image'],
    ];
    const touchedSettings =
      settingsFields.some(([key]) => params[key] !== undefined) ||
      params.socialProof !== undefined ||
      params.urgencyBar !== undefined ||
      params.defaultStageId !== undefined;
    if (touchedSettings) {
      const { data: current, error: fetchError } = await supabase
        .from('quiz_funnels')
        .select('settings')
        .eq('id', params.quizId)
        .single();
      if (fetchError) throw fetchError;
      const settings = { ...((current?.settings as Record<string, unknown>) ?? {}) };
      for (const [key, settingsKey] of settingsFields) {
        const value = params[key];
        if (value === undefined) continue;
        const trimmed = (value as string).trim();
        if (trimmed) settings[settingsKey] = trimmed;
        else delete settings[settingsKey];
      }
      if (params.socialProof !== undefined) settings.social_proof = params.socialProof as never;
      if (params.urgencyBar !== undefined) settings.urgency_bar = params.urgencyBar as never;
      // `null` significa "usar o padrão do funil": a chave sai do settings em
      // vez de ficar guardada como null, que depois viraria etapa órfã se a
      // etapa escolhida fosse excluída.
      if (params.defaultStageId !== undefined) {
        if (params.defaultStageId) settings.default_stage_id = params.defaultStageId;
        else delete settings.default_stage_id;
      }
      patch.settings = settings as never;
    }

    const { data, error } = await supabase
      .from('quiz_funnels')
      .update(patch as never)
      .eq('id', params.quizId)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as QuizFunnel;
  },

  async duplicate(params: { quizId: string; companyId: string; userId: string }): Promise<QuizFunnel> {
    const { data: source, error: sourceError } = await supabase
      .from('quiz_funnels')
      .select('*')
      .eq('id', params.quizId)
      .single();
    if (sourceError) throw sourceError;
    const original = source as unknown as QuizFunnel;
    const schema = await this.getLatestSchema(params.quizId);

    const baseSlug = slugify(`${original.name} copia`);
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
        name: `${original.name} (cópia)`,
        slug: finalSlug,
        niche: original.niche ?? null,
        status: 'draft',
        design: (schema.design ?? {}) as never,
        settings: {} as never,
      })
      .select('*')
      .single();
    if (error) throw error;

    const newQuiz = data as unknown as QuizFunnel;
    await supabase.from('quiz_versions').insert({
      quiz_id: newQuiz.id,
      company_id: params.companyId,
      version: 1,
      schema: schema as never,
      created_by: params.userId,
    });

    return newQuiz;
  },

  async getById(id: string): Promise<QuizFunnel | null> {
    const { data, error } = await supabase.from('quiz_funnels').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as unknown as QuizFunnel) ?? null;
  },

  async getAccessRules(quizId: string): Promise<AccessRules> {
    const { data, error } = await supabase
      .from('quiz_funnels')
      .select('settings')
      .eq('id', quizId)
      .maybeSingle();
    if (error) throw error;
    const settings = (data?.settings ?? {}) as { accessRules?: Partial<AccessRules> };
    return { ...DEFAULT_ACCESS_RULES, ...(settings.accessRules ?? {}) };
  },

  async saveAccessRules(quizId: string, rules: AccessRules): Promise<void> {
    const { data, error: fetchError } = await supabase
      .from('quiz_funnels')
      .select('settings')
      .eq('id', quizId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from('quiz_funnels')
      .update({ settings: { ...settings, accessRules: rules } as never, updated_at: new Date().toISOString() })
      .eq('id', quizId);
    if (error) throw error;
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
      steps: Array.isArray(raw.steps) ? raw.steps : undefined,
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
  },

  /** Salva um rascunho e devolve o id da versão criada. Não publica. */
  async saveSchema(params: {
    quizId: string;
    companyId: string;
    userId: string;
    schema: QuizSchema;
  }): Promise<string> {
    const { data: latest } = await supabase
      .from('quiz_versions')
      .select('version')
      .eq('quiz_id', params.quizId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((latest as { version?: number } | null)?.version ?? 0) + 1;

    const { data: inserted, error } = await supabase
      .from('quiz_versions')
      .insert({
        quiz_id: params.quizId,
        company_id: params.companyId,
        version: nextVersion,
        schema: params.schema as never,
        created_by: params.userId,
      })
      .select('id')
      .single();
    if (error) throw error;

    await supabase
      .from('quiz_funnels')
      .update({ design: params.schema.design as never, updated_at: new Date().toISOString() })
      .eq('id', params.quizId);

    // Salvar NÃO publica. Antes, cada save num quiz publicado — inclusive o
    // autosave de 1,5s — virava a versão ao vivo na hora. Somado à exclusão de
    // bloco sem confirmação, um clique errado tirava conteúdo do ar em segundos,
    // sem aviso: foi assim que a captura de contato saiu do quiz de estética e
    // ninguém percebeu. Agora o rascunho acumula e só `publish()` troca o que
    // está no ar.
    return (inserted as { id: string }).id;
  },

  /** Versão que está no ar e a última salva — para saber se há mudança pendente. */
  async getPublishState(quizId: string): Promise<{
    publishedVersionId: string | null;
    latestVersionId: string | null;
  }> {
    const [{ data: quiz }, { data: latest }] = await Promise.all([
      supabase.from('quiz_funnels').select('published_version_id').eq('id', quizId).maybeSingle(),
      supabase
        .from('quiz_versions')
        .select('id')
        .eq('quiz_id', quizId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      publishedVersionId: (quiz as { published_version_id?: string | null } | null)?.published_version_id ?? null,
      latestVersionId: (latest as { id?: string } | null)?.id ?? null,
    };
  },

  // RLS de leitura pública (anon) em quiz_versions depende de is_published=true,
  // independente do published_version_id em quiz_funnels — os dois precisam ficar em sincronia.
  async markVersionPublished(quizId: string, versionId: string): Promise<void> {
    await supabase.from('quiz_versions').update({ is_published: false }).eq('quiz_id', quizId).neq('id', versionId);
    await supabase
      .from('quiz_versions')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('id', versionId);
  },

  async unpublishAllVersions(quizId: string): Promise<void> {
    await supabase.from('quiz_versions').update({ is_published: false }).eq('quiz_id', quizId);
  },

  async promoteVariant(params: {
    quizId: string;
    companyId: string;
    userId: string;
    blockId: string;
    variantId: string;
  }): Promise<void> {
    const schema = await this.getLatestSchema(params.quizId);
    const block = schema.blocks.find((b) => b.id === params.blockId);
    if (!block || !block.abTest) throw new Error('Bloco ou teste A/B não encontrado');
    const variant = block.abTest.variants.find((v) => v.id === params.variantId);
    if (!variant) throw new Error('Variação não encontrada');

    const updatedBlocks = schema.blocks.map((b) =>
      b.id === params.blockId
        ? {
            ...b,
            title: variant.title ?? b.title,
            subtitle: variant.subtitle ?? b.subtitle,
            ctaLabel: variant.ctaLabel ?? b.ctaLabel,
            imageUrl: variant.imageUrl ?? b.imageUrl,
            abTest: { enabled: false, variants: [] },
          }
        : b
    );

    await this.saveSchema({
      quizId: params.quizId,
      companyId: params.companyId,
      userId: params.userId,
      schema: { ...schema, blocks: updatedBlocks },
    });
  },

  // ============ PUBLIC PLAYER (anon) ============
  async getCompanyIdByHost(host: string): Promise<string | null> {
    const subdomain = parseSubdomain(host);
    if (!subdomain) return null;
    const { data } = await supabase.from('companies').select('id').eq('subdomain', subdomain).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  },

  async getPublishedBySlug(slug: string, host?: string): Promise<{ quiz: QuizFunnel; schema: QuizSchema } | null> {
    let companyId: string | null = null;
    if (host && parseSubdomain(host)) {
      companyId = await this.getCompanyIdByHost(host);
      if (!companyId) return null; // subdomínio não corresponde a nenhuma empresa
    }
    let quizQuery = supabase
      .from('quiz_funnels')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published');
    if (companyId) quizQuery = quizQuery.eq('company_id', companyId);
    const { data: quiz, error } = await quizQuery.maybeSingle();
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
      steps: Array.isArray(raw.steps) ? raw.steps : undefined,
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
    return { quiz: quiz as unknown as QuizFunnel, schema };
  },

  async getDraftBySlug(slug: string, host?: string): Promise<{ quiz: QuizFunnel; schema: QuizSchema } | null> {
    let companyId: string | null = null;
    if (host && parseSubdomain(host)) {
      companyId = await this.getCompanyIdByHost(host);
      if (!companyId) return null; // subdomínio não corresponde a nenhuma empresa
    }
    let quizQuery = supabase.from('quiz_funnels').select('*').eq('slug', slug);
    if (companyId) quizQuery = quizQuery.eq('company_id', companyId);
    const { data: quiz, error } = await quizQuery.maybeSingle();
    if (error) throw error;
    if (!quiz) return null;
    const { data: version } = await supabase
      .from('quiz_versions')
      .select('schema')
      .eq('quiz_id', (quiz as { id: string }).id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = ((version?.schema ?? {}) as Partial<QuizSchema>);
    const schema: QuizSchema = {
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
      steps: Array.isArray(raw.steps) ? raw.steps : undefined,
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
    const versionId = (latest as { id?: string } | null)?.id ?? null;

    await supabase
      .from('quiz_funnels')
      .update({
        status: 'published',
        published_version_id: versionId,
        published_at: new Date().toISOString(),
      })
      .eq('id', quizId);

    if (versionId) await this.markVersionPublished(quizId, versionId);
  },

  async unpublish(quizId: string): Promise<void> {
    await supabase
      .from('quiz_funnels')
      .update({ status: 'draft' })
      .eq('id', quizId);
    await this.unpublishAllVersions(quizId);
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
    tracking?: Record<string, string>;
  }): Promise<string | null> {
    const tracking = params.tracking ?? {};
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
      tracking,
    } as never;
    const { data, error } = await supabase
      .from('quiz_submissions')
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    const submissionId = (data as { id?: string } | null)?.id ?? null;

    // Configurações do funil, lidas uma vez só: o webhook e a etapa de entrada
    // moram na mesma coluna `settings`, e antes o webhook fazia essa consulta
    // sozinho dentro do fire-and-forget.
    const { data: quizRow } = await supabase
      .from('quiz_funnels')
      .select('settings')
      .eq('id', params.quizId)
      .maybeSingle();
    const quizSettings = (quizRow?.settings as Record<string, unknown> | undefined) ?? {};
    const defaultStageId = (quizSettings.default_stage_id as string | undefined) ?? null;

    // Fire-and-forget webhook, se configurado nas configurações do quiz
    (async () => {
      try {
        const webhookUrl = quizSettings.webhook_url as string | undefined;
        if (!webhookUrl) return;
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'quiz.submission.completed',
            quiz_id: params.quizId,
            submission_id: submissionId,
            score: params.score,
            temperature: params.temperature,
            tags: params.tags,
            contact: { email: params.email ?? null, phone: params.phone ?? null, name: params.name ?? null },
            responses: params.responses,
            tracking,
            completed_at: new Date().toISOString(),
          }),
        });
      } catch {
        // Fire-and-forget: falhas de webhook não devem quebrar a submissão do quiz
      }
    })();

    // Auto-create lead + trigger CV.CRM sync when contact info was captured
    if (params.email || params.phone) {
      try {
        const leadId = crypto.randomUUID();

        // Etapa de entrada configurada neste funil (aba Geral das configurações
        // do quiz). Via RPC, não lendo `stages`: o visitante do quiz é anônimo
        // e não tem permissão nessa tabela — ler dali lançava e derrubava a
        // criação do lead junto.
        const entryStageId = await resolveEntryStageId(params.companyId, defaultStageId);

        const { error: leadError } = await supabase
          .from('leads')
          .insert({
            id: leadId,
            company_id: params.companyId,
            quiz_id: params.quizId,
            name: params.name ?? null,
            email: params.email ?? null,
            phone: params.phone ?? null,
            source: 'Alt Quiz',
            status: 'new',
            stage_id: entryStageId,
            stage_entered_at: new Date().toISOString(),
            board_order: newLeadBoardOrder(),
            score: params.score,
            temperature: params.temperature,
            // `tags` não é coluna de `leads` — as etiquetas moram na tabela
            // `lead_tags`. Mandar a chave aqui fazia o insert inteiro falhar
            // com 42703, e como o erro nunca era logado, o quiz mostrava
            // "obrigado" e o lead simplesmente não existia. Nenhum lead de
            // quiz jamais entrou neste banco por causa disso.
            utm_source: tracking.utm_source ?? null,
            utm_medium: tracking.utm_medium ?? null,
            utm_campaign: tracking.utm_campaign ?? null,
            utm_content: tracking.utm_content ?? null,
            utm_term: tracking.utm_term ?? null,
            metadata: {
              quiz_id: params.quizId,
              submission_id: submissionId,
              responses: params.responses,
            },
          } as never);

        // Sem este log, uma falha de insert sumia sem deixar rastro: o quiz
        // mostrava "obrigado", a submissão era gravada e o lead simplesmente
        // não existia. Foi assim que a regressão da etapa passou despercebida.
        if (leadError) {
          console.error('Falha ao criar lead do quiz', leadError);
        } else {
          if (submissionId) {
            await supabase.from('quiz_submissions').update({ lead_id: leadId } as never).eq('id', submissionId);
          }

          // Etiquetas na tabela certa, como o formulário público já faz.
          if (params.tags.length) {
            await supabase
              .from('lead_tags')
              .insert(params.tags.map((tag) => ({ lead_id: leadId, tag_name: tag })) as never);
          }

          // Auto-assign to sales rep via routing engine
          try {
            const { leadRoutingEngine } = await import('@/modules/intelligence/services/leadRoutingEngine');
            await leadRoutingEngine.assignLead(leadId, params.companyId, params.temperature);
          } catch (e) {
            console.warn('Lead routing failed', e);
          }

          // Check if CV.CRM is connected and dispatch (fire-and-forget)
          const { data: integ } = await supabase
            .from('cvcrm_integrations')
            .select('is_active, connection_status')
            .eq('company_id', params.companyId)
            .maybeSingle();
          const active = (integ as { is_active?: boolean; connection_status?: string } | null);
          if (active?.is_active && active.connection_status === 'connected') {
            supabase.functions
              .invoke('send-cvcrm-lead', {
                body: { lead_id: leadId, tenant_id: params.companyId, trace_id: crypto.randomUUID() },
              })
              .catch((e) => console.warn('CV.CRM dispatch failed', e));
          }
        }
      } catch (e) {
        console.warn('Lead capture from quiz failed', e);
      }
    }

    return submissionId;
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
      payload: params.metadata ?? {},
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
    dropOffByBlock: { blockId: string; label: string; views: number; dropRate: number }[];
    leadsCaptured: number;
    utmBreakdown: { campaign: string; source: string; submissions: number; completions: number }[];
    audienceByDevice: { device: string; count: number }[];
    audienceByBrowser: { browser: string; count: number }[];
    geoBreakdown: { country: string; count: number }[];
  }> {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [{ data: events }, { data: subs }, schema] = await Promise.all([
      supabase
        .from('quiz_events')
        .select('event_type, block_id, created_at')
        .eq('quiz_id', quizId)
        .gte('created_at', since),
      supabase
        .from('quiz_submissions')
        .select('id, score, temperature, answers, status, created_at, tracking')
        .eq('quiz_id', quizId)
        .gte('created_at', since),
      this.getLatestSchema(quizId),
    ]);

    const evs = (events ?? []) as Array<{ event_type: string; block_id: string | null; created_at: string }>;
    const subsData = (subs ?? []) as unknown as Array<{
      score: number | null;
      temperature: string | null;
      answers: Record<string, unknown> | null;
      status: string | null;
      created_at: string;
      tracking: Record<string, string> | null;
    }>;

    const starts = evs.filter((e) => e.event_type === 'start').length;
    const completions = evs.filter((e) => e.event_type === 'complete').length;
    const submissions = subsData.length;
    const leadsCaptured = subsData.filter((s) => {
      const c = (s.answers?._contact ?? {}) as { email?: string | null; phone?: string | null };
      return !!(c.email || c.phone);
    }).length;
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
    let previousViews = starts;
    const dropOffByBlock = schema.blocks.map((block) => {
      const views = blockViews.get(block.id) ?? 0;
      const dropRate = previousViews > 0 ? Math.max(0, ((previousViews - views) / previousViews) * 100) : 0;
      previousViews = views;
      return {
        blockId: block.id,
        label: block.title || block.resultTitle || block.type,
        views,
        dropRate,
      };
    });

    const utmMap = new Map<string, { campaign: string; source: string; submissions: number; completions: number }>();
    for (const s of subsData) {
      const t = s.tracking ?? {};
      const campaign = t.utm_campaign || '';
      const source = t.utm_source || 'Direto';
      const key = `${campaign}::${source}`;
      const entry = utmMap.get(key) ?? { campaign: campaign || 'Sem campanha', source, submissions: 0, completions: 0 };
      entry.submissions++;
      if (s.status === 'completed') entry.completions++;
      utmMap.set(key, entry);
    }
    const utmBreakdown = Array.from(utmMap.values()).sort((a, b) => b.submissions - a.submissions);

    const deviceMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const geoMap = new Map<string, number>();
    for (const s of subsData) {
      const t = s.tracking ?? {};
      if (t.user_agent) {
        const { device, browser } = parseUserAgent(t.user_agent);
        deviceMap.set(device, (deviceMap.get(device) ?? 0) + 1);
        browserMap.set(browser, (browserMap.get(browser) ?? 0) + 1);
      }
      if (t.geo_country) {
        geoMap.set(t.geo_country, (geoMap.get(t.geo_country) ?? 0) + 1);
      }
    }
    const audienceByDevice = Array.from(deviceMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count);
    const audienceByBrowser = Array.from(browserMap.entries())
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count);
    const geoBreakdown = Array.from(geoMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

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
      utmBreakdown,
      audienceByDevice,
      audienceByBrowser,
      geoBreakdown,
    };
  },

  async listSubmissions(quizId: string, limit = 100): Promise<Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    score: number | null;
    temperature: string | null;
    completed: boolean;
    created_at: string;
  }>> {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select('id, answers, score, temperature, status, created_at')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      answers: Record<string, unknown> | null;
      score: number | null;
      temperature: string | null;
      status: string | null;
      created_at: string;
    }>;
    return rows.map((r) => {
      const c = (r.answers?._contact ?? {}) as { email?: string | null; phone?: string | null; name?: string | null };
      return {
        id: r.id,
        name: c.name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        score: r.score,
        temperature: r.temperature,
        completed: r.status === 'completed',
        created_at: r.created_at,
      };
    });
  },

  async getListStats(companyId: string): Promise<Record<string, { total: number; completed: number; leadsCaptured: number }>> {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select('quiz_id, status, answers')
      .eq('company_id', companyId);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      quiz_id: string;
      status: string | null;
      answers: Record<string, unknown> | null;
    }>;
    const stats: Record<string, { total: number; completed: number; leadsCaptured: number }> = {};
    for (const r of rows) {
      const entry = stats[r.quiz_id] ?? { total: 0, completed: 0, leadsCaptured: 0 };
      entry.total++;
      if (r.status === 'completed') entry.completed++;
      const c = (r.answers?._contact ?? {}) as { email?: string | null; phone?: string | null };
      if (c.email || c.phone) entry.leadsCaptured++;
      stats[r.quiz_id] = entry;
    }
    return stats;
  },

  async getAbTestStats(quizId: string, days = 30): Promise<Array<{
    blockId: string;
    blockLabel: string;
    variants: Array<{ id: string; label: string; views: number; advances: number; conversionRate: number }>;
  }>> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [schema, { data: events, error }] = await Promise.all([
      this.getLatestSchema(quizId),
      supabase
        .from('quiz_events')
        .select('event_type, block_id, payload, created_at')
        .eq('quiz_id', quizId)
        .in('event_type', ['block_view', 'block_advance'])
        .gte('created_at', since),
    ]);
    if (error) throw error;
    const evs = (events ?? []) as Array<{
      event_type: string;
      block_id: string | null;
      payload: Record<string, unknown> | null;
    }>;

    const results: Array<{
      blockId: string;
      blockLabel: string;
      variants: Array<{ id: string; label: string; views: number; advances: number; conversionRate: number }>;
    }> = [];

    for (const block of schema.blocks) {
      if (!block.abTest?.enabled || block.abTest.variants.length === 0) continue;
      const allVariants = [
        { id: 'control', title: block.title },
        ...block.abTest.variants.map((v) => ({ id: v.id, title: v.title })),
      ];
      const variantStats = allVariants.map((v) => {
        const views = evs.filter(
          (e) => e.block_id === block.id && e.event_type === 'block_view' && (e.payload?.variant_id ?? 'control') === v.id
        ).length;
        const advances = evs.filter(
          (e) => e.block_id === block.id && e.event_type === 'block_advance' && (e.payload?.variant_id ?? 'control') === v.id
        ).length;
        return {
          id: v.id,
          label: v.id === 'control' ? 'Original' : v.title || 'Variação',
          views,
          advances,
          conversionRate: views > 0 ? (advances / views) * 100 : 0,
        };
      });
      results.push({
        blockId: block.id,
        blockLabel: block.title || block.resultTitle || block.type,
        variants: variantStats,
      });
    }

    return results;
  },
};
