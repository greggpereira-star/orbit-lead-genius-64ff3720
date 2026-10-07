import { supabase } from "@/integrations/supabase/client";
import { prefixoDoQuiz, outroQuizUsaAMidia } from "../lib/midiaDoQuiz";
import {
  classificarArquivos,
  quizDoCaminho,
  type ArquivoClassificado,
  type ArquivoDaBiblioteca,
} from "../lib/biblioteca";

/** Mesmo bucket do `mediaService`. */
const BUCKET_DE_MIDIA = "quiz-media";
import { MODELOS_DE_QUIZ } from "../quiz-templates";
import type {
  QuizFunnel,
  QuizTemplate,
  QuizSchema,
  AccessRules,
  SocialProofSettings,
  UrgencyBarSettings,
} from "../types";
import { DEFAULT_DESIGN } from "../design-presets";
import { DEFAULT_ACCESS_RULES } from "../types";
import { parseSubdomain } from "../lib/tenant";
import { resolveEntryStageId, newLeadBoardOrder } from "@/modules/crm/services/stageService";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "quiz"
  );
}

function parseUserAgent(ua: string): { device: string; browser: string } {
  const isTablet = /iPad|Tablet/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod/i.test(ua);
  const device = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";
  let browser = "Outro";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return { device, browser };
}

async function findUniqueSlug(
  companyId: string,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let finalSlug = baseSlug;
  for (let i = 2; i < 20; i++) {
    let query = supabase
      .from("quiz_funnels")
      .select("id")
      .eq("company_id", companyId)
      .eq("slug", finalSlug);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: exists } = await query.maybeSingle();
    if (!exists) break;
    finalSlug = `${baseSlug}-${i}`;
  }
  return finalSlug;
}

/**
 * Grava (ou completa) o lead de uma sessão do quiz.
 *
 * Chamada duas vezes na vida de um respondente: quando o contato aparece — é
 * o que salva quem abandona depois de digitar o e-mail — e de novo ao
 * concluir. A chave é `sessionId`: a segunda chamada completa o mesmo lead em
 * vez de criar outro.
 *
 * Passa por RPC porque o respondente é anônimo. Deixar um cliente anônimo dar
 * UPDATE em `leads` exigiria uma política que liberaria atualizar qualquer
 * lead da base — a função faz o oposto: deriva a empresa do próprio quiz e só
 * acrescenta dados.
 */
export async function captureQuizLead(params: {
  quizId: string;
  sessionId: string;
  email?: string;
  phone?: string;
  name?: string;
  score?: number;
  temperature?: "hot" | "warm" | "cold";
  tracking?: Record<string, string>;
  responses?: Record<string, unknown>;
  submissionId?: string | null;
  completed?: boolean;
  tags?: string[];
}): Promise<string | null> {
  if (!params.email && !params.phone) return null;
  const { data, error } = await (supabase as any).rpc("quiz_capture_lead", {
    p_quiz_id: params.quizId,
    p_session_id: params.sessionId,
    p_email: params.email ?? null,
    p_phone: params.phone ?? null,
    p_name: params.name ?? null,
    p_score: params.score ?? 0,
    p_temperature: params.temperature ?? "cold",
    p_tracking: params.tracking ?? {},
    p_responses: params.responses ?? {},
    p_submission_id: params.submissionId ?? null,
    p_completed: params.completed ?? false,
    p_tags: params.tags ?? [],
  });
  if (error) {
    // Sem log, uma falha aqui volta a ser invisível — foi assim que nenhum
    // lead de quiz entrou na base por meses.
    console.error("Falha ao capturar lead do quiz", error);
    return null;
  }
  return (data as string | null) ?? null;
}

export const quizService = {
  async list(companyId: string): Promise<QuizFunnel[]> {
    const { data, error } = await supabase
      .from("quiz_funnels")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as QuizFunnel[];
  },

  /**
   * Os modelos vêm do CÓDIGO, não da tabela.
   *
   * As seis linhas que existiam em `quiz_templates` tinham `blocks: []`: "Usar
   * Template" criava um quiz vazio com nome bonito e nada avisava. Em código o
   * tipo confere na compilação e o teste roda o validador de publicação em cima
   * de cada um — a tabela não oferece nenhum dos dois.
   *
   * A tabela continua sendo lida, para o dia em que houver modelo próprio de
   * cliente, mas linha SEM bloco é descartada aqui: é exatamente o defeito que
   * motivou a mudança, e não queremos que volte por outro caminho.
   */
  async listTemplates(): Promise<QuizTemplate[]> {
    const doCodigo: QuizTemplate[] = MODELOS_DE_QUIZ.map((m, i) => ({
      id: `codigo:${m.slug}`,
      slug: m.slug,
      name: m.name,
      niche: m.niche,
      description: m.description,
      cover_url: null,
      schema: m.build() as unknown as Record<string, unknown>,
      sort_order: (i + 1) * 10,
      emoji: m.emoji,
    }));

    const { data, error } = await supabase
      .from("quiz_templates")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    // Falha de rede aqui não deve esconder os modelos do código.
    if (error) return doCodigo;

    const doBanco = ((data ?? []) as unknown as QuizTemplate[]).filter((t) => {
      const blocos = (t.schema as { blocks?: unknown[] } | null)?.blocks;
      return Array.isArray(blocos) && blocos.length > 0;
    });

    const slugsDoCodigo = new Set(doCodigo.map((t) => t.slug));
    return [...doCodigo, ...doBanco.filter((t) => !slugsDoCodigo.has(t.slug))];
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
        .from("quiz_funnels")
        .select("id")
        .eq("company_id", params.companyId)
        .eq("slug", finalSlug)
        .maybeSingle();
      if (!exists) break;
      finalSlug = `${baseSlug}-${i}`;
    }

    const { data, error } = await supabase
      .from("quiz_funnels")
      .insert({
        company_id: params.companyId,
        created_by: params.userId,
        name: params.name,
        slug: finalSlug,
        niche: params.niche ?? null,
        status: "draft",
        design: ((params.templateSchema?.design as Record<string, unknown>) ?? {}) as never,
        settings: {} as never,
      })
      .select("*")
      .single();
    if (error) throw error;

    // Create initial version with template schema
    await supabase.from("quiz_versions").insert({
      quiz_id: (data as { id: string }).id,
      company_id: params.companyId,
      version: 1,
      schema: (params.templateSchema ?? { blocks: [], results: [], design: {} }) as never,
      created_by: params.userId,
    });

    return data as unknown as QuizFunnel;
  },

  /**
   * Lista tudo que existe sob um prefixo do bucket, descendo nas subpastas.
   *
   * `list` não é recursivo, e as respostas em vídeo moram em `<quiz>/respostas/`
   * — sem descer, elas ficariam para trás e o "apagar junto" seria meia
   * verdade.
   */
  async _listarMidia(prefixo: string, profundidade = 0): Promise<string[]> {
    if (profundidade > 3) return [];
    const { data, error } = await supabase.storage
      .from(BUCKET_DE_MIDIA)
      .list(prefixo.replace(/\/$/, ""), { limit: 1000 });
    if (error || !data) return [];

    const caminhos: string[] = [];
    for (const item of data) {
      const filho = `${prefixo}${item.name}`;
      // Pasta vem sem `id`; arquivo vem com.
      if (item.id) caminhos.push(filho);
      else caminhos.push(...(await this._listarMidia(`${filho}/`, profundidade + 1)));
    }
    return caminhos;
  },

  /**
   * Tudo que a empresa tem no bucket, já cruzado com os quizzes existentes.
   *
   * Uma passada só: lista os arquivos, lê os schemas vivos e classifica. O
   * cruzamento é o que distingue "órfão" de "em uso" — e são perguntas
   * diferentes, porque uma cópia pode referenciar a mídia de um quiz já
   * apagado.
   */
  async listarBiblioteca(companyId: string): Promise<ArquivoClassificado[]> {
    const caminhos = await this._listarMidia(`${companyId}/`);
    if (!caminhos.length) return [];

    const { data: quizzes } = await supabase
      .from("quiz_funnels")
      .select("id, name")
      .eq("company_id", companyId);
    const linhas = (quizzes ?? []) as { id: string; name: string | null }[];
    const ids = linhas.map((q) => q.id);
    const nomesDeQuiz: Record<string, string> = {};
    for (const q of linhas) if (q.name) nomesDeQuiz[q.id] = q.name;

    const schemas = await Promise.all(ids.map((id) => this.getLatestSchema(id).catch(() => null)));

    /* O metadado vem da listagem por pasta, não de um `select` — o storage do
       Supabase não expõe tabela para o cliente. Uma chamada por pasta é o
       preço; são poucas. */
    const porPasta = new Map<string, string[]>();
    for (const c of caminhos) {
      const pasta = c.slice(0, c.lastIndexOf("/"));
      porPasta.set(pasta, [...(porPasta.get(pasta) ?? []), c]);
    }

    const arquivos: ArquivoDaBiblioteca[] = [];
    for (const pasta of porPasta.keys()) {
      const { data } = await supabase.storage.from(BUCKET_DE_MIDIA).list(pasta, { limit: 1000 });
      for (const item of data ?? []) {
        if (!item.id) continue;
        const caminho = `${pasta}/${item.name}`;
        const meta = (item.metadata ?? {}) as { size?: number; mimetype?: string };
        arquivos.push({
          caminho,
          bytes: meta.size ?? 0,
          mimeType: meta.mimetype ?? "",
          criadoEm: item.created_at ?? "",
          quizId: quizDoCaminho(caminho, companyId),
          deVisitante: caminho.includes("/respostas/"),
        });
      }
    }

    return classificarArquivos({
      arquivos,
      companyId,
      quizzesExistentes: ids,
      nomesDeQuiz,
      schemasSerializados: schemas.map((x) => {
        try {
          return JSON.stringify(x ?? {});
        } catch {
          return "";
        }
      }),
    });
  },

  /** URLs assinadas para a prévia. Uma hora basta para olhar a tela. */
  async assinarMidia(caminhos: string[]): Promise<Record<string, string>> {
    if (!caminhos.length) return {};
    const { data } = await supabase.storage
      .from(BUCKET_DE_MIDIA)
      .createSignedUrls(caminhos, 60 * 60);
    const mapa: Record<string, string> = {};
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
    }
    return mapa;
  },

  async apagarMidia(caminhos: string[]): Promise<void> {
    if (!caminhos.length) return;
    const { error } = await supabase.storage.from(BUCKET_DE_MIDIA).remove(caminhos);
    if (error) throw error;
  },

  /**
   * Apaga o quiz e, junto, a mídia que só ele usa.
   *
   * O "só ele" não é detalhe: duplicar um quiz copia o schema com as MESMAS
   * urls, então a cópia aponta para os arquivos do original. Apagar às cegas
   * deixaria a cópia com imagem e vídeo quebrados, sem nada dizendo por quê.
   *
   * A mídia some ANTES do quiz. Se a limpeza falhar, o quiz continua lá e o
   * erro aparece — melhor que perder o quiz e deixar os arquivos órfãos, que é
   * o estado em que ninguém mais consegue encontrá-los.
   */
  async remove(
    id: string,
    companyId?: string,
  ): Promise<{ arquivosApagados: number; midiaPreservada: boolean }> {
    let arquivosApagados = 0;
    let midiaPreservada = false;

    if (companyId) {
      const prefixo = prefixoDoQuiz(companyId, id);
      const { data: outros } = await supabase
        .from("quiz_funnels")
        .select("id")
        .eq("company_id", companyId)
        .neq("id", id);

      const schemas = await Promise.all(
        ((outros ?? []) as { id: string }[]).map((q) =>
          this.getLatestSchema(q.id).catch(() => null),
        ),
      );

      if (outroQuizUsaAMidia(schemas, prefixo)) {
        midiaPreservada = true;
      } else {
        const caminhos = await this._listarMidia(prefixo);
        if (caminhos.length) {
          const { error } = await supabase.storage.from(BUCKET_DE_MIDIA).remove(caminhos);
          if (error) throw error;
          arquivosApagados = caminhos.length;
        }
      }
    }

    const { error } = await supabase.from("quiz_funnels").delete().eq("id", id);
    if (error) throw error;
    return { arquivosApagados, midiaPreservada };
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
    /* Medição só deste funil. Em branco = herda o pixel da empresa. */
    scoreTiers?: import("../types").ScoreTier[];
    metaPixelId?: string;
    googleConversionId?: string;
    googleLeadLabel?: string;
    googleCompleteLabel?: string;
    /** Assinatura no rodapé do funil público. Desligada por padrão. */
    mostrarAssinatura?: boolean;
  }): Promise<QuizFunnel> {
    const patch: Record<string, unknown> = {};

    if (params.name !== undefined) {
      const trimmed = params.name.trim();
      if (!trimmed) throw new Error("Nome do quiz não pode ficar vazio");
      patch.name = trimmed;
    }

    if (params.slug !== undefined) {
      const desired = slugify(params.slug);
      patch.slug = await findUniqueSlug(params.companyId, desired, params.quizId);
    }

    const settingsFields: [keyof typeof params, string][] = [
      ["customDomain", "custom_domain"],
      ["webhookUrl", "webhook_url"],
      ["customHeadScript", "custom_head_script"],
      ["seoTitle", "seo_title"],
      ["seoDescription", "seo_description"],
      ["seoOgImage", "seo_og_image"],
      ["scoreTiers", "score_tiers"],
      ["metaPixelId", "meta_pixel_id"],
      ["googleConversionId", "google_conversion_id"],
      ["googleLeadLabel", "google_lead_label"],
      ["googleCompleteLabel", "google_complete_label"],
      ["mostrarAssinatura", "mostrar_assinatura"],
    ];
    const touchedSettings =
      settingsFields.some(([key]) => params[key] !== undefined) ||
      params.socialProof !== undefined ||
      params.urgencyBar !== undefined ||
      params.defaultStageId !== undefined;
    if (touchedSettings) {
      const { data: current, error: fetchError } = await supabase
        .from("quiz_funnels")
        .select("settings")
        .eq("id", params.quizId)
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
      .from("quiz_funnels")
      .update(patch as never)
      .eq("id", params.quizId)
      .select("*")
      .single();
    if (error) throw error;
    return data as unknown as QuizFunnel;
  },

  /**
   * Arquiva ou tira do arquivo.
   *
   * Arquivar DESPUBLICA junto: um quiz fora da lista de trabalho mas ainda
   * respondendo no link público seria a pior combinação — ninguém olha os leads
   * que ele continua gerando.
   */
  async setArchived(quizId: string, arquivado: boolean): Promise<void> {
    const { error } = await supabase
      .from("quiz_funnels")
      .update({ status: arquivado ? "archived" : "draft" } as never)
      .eq("id", quizId);
    if (error) throw error;
  },

  async duplicate(params: {
    quizId: string;
    companyId: string;
    userId: string;
  }): Promise<QuizFunnel> {
    const { data: source, error: sourceError } = await supabase
      .from("quiz_funnels")
      .select("*")
      .eq("id", params.quizId)
      .single();
    if (sourceError) throw sourceError;
    const original = source as unknown as QuizFunnel;
    const schema = await this.getLatestSchema(params.quizId);

    const baseSlug = slugify(`${original.name} copia`);
    let finalSlug = baseSlug;
    for (let i = 2; i < 20; i++) {
      const { data: exists } = await supabase
        .from("quiz_funnels")
        .select("id")
        .eq("company_id", params.companyId)
        .eq("slug", finalSlug)
        .maybeSingle();
      if (!exists) break;
      finalSlug = `${baseSlug}-${i}`;
    }

    const { data, error } = await supabase
      .from("quiz_funnels")
      .insert({
        company_id: params.companyId,
        created_by: params.userId,
        name: `${original.name} (cópia)`,
        slug: finalSlug,
        niche: original.niche ?? null,
        status: "draft",
        design: (schema.design ?? {}) as never,
        settings: {} as never,
      })
      .select("*")
      .single();
    if (error) throw error;

    const newQuiz = data as unknown as QuizFunnel;
    await supabase.from("quiz_versions").insert({
      quiz_id: newQuiz.id,
      company_id: params.companyId,
      version: 1,
      schema: schema as never,
      created_by: params.userId,
    });

    return newQuiz;
  },

  async getById(id: string): Promise<QuizFunnel | null> {
    const { data, error } = await supabase
      .from("quiz_funnels")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as QuizFunnel) ?? null;
  },

  async getAccessRules(quizId: string): Promise<AccessRules> {
    const { data, error } = await supabase
      .from("quiz_funnels")
      .select("settings")
      .eq("id", quizId)
      .maybeSingle();
    if (error) throw error;
    const settings = (data?.settings ?? {}) as { accessRules?: Partial<AccessRules> };
    return { ...DEFAULT_ACCESS_RULES, ...(settings.accessRules ?? {}) };
  },

  async saveAccessRules(quizId: string, rules: AccessRules): Promise<void> {
    const { data, error: fetchError } = await supabase
      .from("quiz_funnels")
      .select("settings")
      .eq("id", quizId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from("quiz_funnels")
      .update({
        settings: { ...settings, accessRules: rules } as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quizId);
    if (error) throw error;
  },

  async getLatestSchema(quizId: string): Promise<QuizSchema> {
    const { data, error } = await supabase
      .from("quiz_versions")
      .select("schema")
      .eq("quiz_id", quizId)
      .order("version", { ascending: false })
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
      .from("quiz_versions")
      .select("version")
      .eq("quiz_id", params.quizId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((latest as { version?: number } | null)?.version ?? 0) + 1;

    const { data: inserted, error } = await supabase
      .from("quiz_versions")
      .insert({
        quiz_id: params.quizId,
        company_id: params.companyId,
        version: nextVersion,
        schema: params.schema as never,
        created_by: params.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase
      .from("quiz_funnels")
      .update({ design: params.schema.design as never, updated_at: new Date().toISOString() })
      .eq("id", params.quizId);

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
      supabase.from("quiz_funnels").select("published_version_id").eq("id", quizId).maybeSingle(),
      supabase
        .from("quiz_versions")
        .select("id")
        .eq("quiz_id", quizId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      publishedVersionId:
        (quiz as { published_version_id?: string | null } | null)?.published_version_id ?? null,
      latestVersionId: (latest as { id?: string } | null)?.id ?? null,
    };
  },

  // RLS de leitura pública (anon) em quiz_versions depende de is_published=true,
  // independente do published_version_id em quiz_funnels — os dois precisam ficar em sincronia.
  async markVersionPublished(quizId: string, versionId: string): Promise<void> {
    await supabase
      .from("quiz_versions")
      .update({ is_published: false })
      .eq("quiz_id", quizId)
      .neq("id", versionId);
    await supabase
      .from("quiz_versions")
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq("id", versionId);
  },

  async unpublishAllVersions(quizId: string): Promise<void> {
    await supabase.from("quiz_versions").update({ is_published: false }).eq("quiz_id", quizId);
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
    if (!block || !block.abTest) throw new Error("Bloco ou teste A/B não encontrado");
    const variant = block.abTest.variants.find((v) => v.id === params.variantId);
    if (!variant) throw new Error("Variação não encontrada");

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
        : b,
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
    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  },

  async getPublishedBySlug(
    slug: string,
    host?: string,
  ): Promise<{ quiz: QuizFunnel; schema: QuizSchema } | null> {
    let companyId: string | null = null;
    if (host && parseSubdomain(host)) {
      companyId = await this.getCompanyIdByHost(host);
      if (!companyId) return null; // subdomínio não corresponde a nenhuma empresa
    }
    let quizQuery = supabase
      .from("quiz_funnels")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published");
    if (companyId) quizQuery = quizQuery.eq("company_id", companyId);
    const { data: quiz, error } = await quizQuery.maybeSingle();
    if (error) throw error;
    if (!quiz) return null;

    const publishedVersionId = (quiz as { published_version_id: string | null })
      .published_version_id;
    let versionQuery = supabase
      .from("quiz_versions")
      .select("schema")
      .eq("quiz_id", (quiz as { id: string }).id);
    if (publishedVersionId) {
      versionQuery = versionQuery.eq("id", publishedVersionId);
    } else {
      versionQuery = versionQuery.order("version", { ascending: false }).limit(1);
    }
    const { data: version } = await versionQuery.maybeSingle();
    const raw = (version?.schema ?? {}) as Partial<QuizSchema>;
    const schema: QuizSchema = {
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
      steps: Array.isArray(raw.steps) ? raw.steps : undefined,
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
    return { quiz: quiz as unknown as QuizFunnel, schema };
  },

  async getDraftBySlug(
    slug: string,
    host?: string,
  ): Promise<{ quiz: QuizFunnel; schema: QuizSchema } | null> {
    let companyId: string | null = null;
    if (host && parseSubdomain(host)) {
      companyId = await this.getCompanyIdByHost(host);
      if (!companyId) return null; // subdomínio não corresponde a nenhuma empresa
    }
    let quizQuery = supabase.from("quiz_funnels").select("*").eq("slug", slug);
    if (companyId) quizQuery = quizQuery.eq("company_id", companyId);
    const { data: quiz, error } = await quizQuery.maybeSingle();
    if (error) throw error;
    if (!quiz) return null;
    const { data: version } = await supabase
      .from("quiz_versions")
      .select("schema")
      .eq("quiz_id", (quiz as { id: string }).id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (version?.schema ?? {}) as Partial<QuizSchema>;
    const schema: QuizSchema = {
      blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
      steps: Array.isArray(raw.steps) ? raw.steps : undefined,
      design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
      results: raw.results ?? [],
    };
    return { quiz: quiz as unknown as QuizFunnel, schema };
  },

  /**
   * Coloca uma versão no ar.
   *
   * `versionId` deve ser informado por quem acabou de salvar. Sem ele, esta
   * função relê "a última versão" — e foi assim que o link público quebrou com
   * "Quiz não encontrado": o autosave (1,5s) inseriu uma versão NOVA entre a
   * leitura do ponteiro e a marcação da flag, e cada uma foi parar numa linha
   * diferente. O visitante pedia a versão do ponteiro e o banco só liberava a
   * da flag.
   */
  async publish(quizId: string, versionId?: string): Promise<void> {
    let target = versionId ?? null;
    if (!target) {
      const { data: latest } = await supabase
        .from("quiz_versions")
        .select("id")
        .eq("quiz_id", quizId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = (latest as { id?: string } | null)?.id ?? null;
    }

    // A flag vem ANTES do ponteiro. Se algo falhar no meio, sobra uma flag sem
    // ponteiro — inofensivo, porque a leitura pública passou a derivar do
    // ponteiro. Na ordem inversa, sobraria um ponteiro para uma versão que o
    // visitante não pode ler: exatamente a falha que estamos corrigindo.
    if (target) await this.markVersionPublished(quizId, target);

    const { error } = await supabase
      .from("quiz_funnels")
      .update({
        status: "published",
        published_version_id: target,
        published_at: new Date().toISOString(),
      })
      .eq("id", quizId);
    if (error) throw error;
  },

  async unpublish(quizId: string): Promise<void> {
    await supabase.from("quiz_funnels").update({ status: "draft" }).eq("id", quizId);
    await this.unpublishAllVersions(quizId);
  },

  async submitPublic(params: {
    quizId: string;
    companyId: string;
    responses: Record<string, unknown>;
    score: number;
    tags: string[];
    temperature: "hot" | "warm" | "cold";
    email?: string;
    phone?: string;
    name?: string;
    tracking?: Record<string, string>;
    /** Mesma sessão da captura antecipada — é a chave que evita lead duplicado. */
    sessionId: string;
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
    /* O id vem daqui, e não do banco, por um motivo de autorização: com
       `.select('id')` o PostgREST faz `insert ... returning`, e o Postgres
       aplica também a política de SELECT da tabela — que para `anon` não
       existe. O insert passava e o retorno derrubava tudo com 42501, o que
       parecia erro de WITH CHECK. Gerando o id antes, a submissão grava sem
       precisar ler nada de volta. */
    const submissionId = crypto.randomUUID();
    const payload = {
      id: submissionId,
      quiz_id: params.quizId,
      company_id: params.companyId,
      answers,
      score: params.score,
      tags: params.tags,
      temperature: params.temperature,
      status: "completed",
      completed_at: new Date().toISOString(),
      tracking,
    } as never;
    const { error } = await supabase.from("quiz_submissions").insert(payload);
    if (error) throw error;

    // Configurações do funil, lidas uma vez só: o webhook e a etapa de entrada
    // moram na mesma coluna `settings`, e antes o webhook fazia essa consulta
    // sozinho dentro do fire-and-forget.
    const { data: quizRow } = await supabase
      .from("quiz_funnels")
      .select("settings")
      .eq("id", params.quizId)
      .maybeSingle();
    const quizSettings = (quizRow?.settings as Record<string, unknown> | undefined) ?? {};
    const defaultStageId = (quizSettings.default_stage_id as string | undefined) ?? null;

    // Fire-and-forget webhook, se configurado nas configurações do quiz
    (async () => {
      try {
        const webhookUrl = quizSettings.webhook_url as string | undefined;
        if (!webhookUrl) return;
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "quiz.submission.completed",
            quiz_id: params.quizId,
            submission_id: submissionId,
            score: params.score,
            temperature: params.temperature,
            tags: params.tags,
            contact: {
              email: params.email ?? null,
              phone: params.phone ?? null,
              name: params.name ?? null,
            },
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
        // MESMA função da captura antecipada, com `completed: true`. Se o
        // visitante já tinha sido capturado ao preencher o e-mail, isto
        // COMPLETA aquele lead em vez de criar um segundo — a chave é a
        // sessão. Escrever pela função também tira o insert direto em `leads`
        // das mãos de um cliente anônimo.
        const leadId = await captureQuizLead({
          quizId: params.quizId,
          sessionId: params.sessionId,
          email: params.email,
          phone: params.phone,
          name: params.name,
          score: params.score,
          temperature: params.temperature,
          tracking,
          responses: params.responses,
          submissionId,
          completed: true,
          tags: params.tags,
        });
        // `!leadId` cobre os dois casos de uma vez: falha na função (que já
        // logou o motivo) e quiz sem contato nenhum, onde não existe lead a
        // criar. Também é o que estreita o tipo para o resto do bloco.
        if (!leadId) {
          console.warn("Quiz concluído sem lead — sem contato ou captura falhou");
        } else {
          /* O vínculo submissão→lead e as etiquetas ficavam aqui, como escrita
             direta de um cliente anônimo que não tem grant para nenhuma das
             duas tabelas. A primeira estourava e o catch abaixo engolia a
             segunda junto com o roteamento: o lead nascia sem etiqueta, sem
             responsável e sem vínculo, em silêncio. Agora as duas acontecem
             dentro de `quiz_capture_lead`, que já é SECURITY DEFINER.

             O roteamento e o despacho para o CV.CRM também moravam aqui, e
             também nunca rodaram: `routing_configs` e `cvcrm_integrations`
             voltavam 401 para o visitante anônimo. Os dois passaram para
             `/api/public/quiz-completed`, que já roda com a chave de serviço
             e já encontra o lead pela sessão. */
          void leadId;
        }
      } catch (e) {
        console.warn("Lead capture from quiz failed", e);
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
    /* Sem a sessão, só dá para contar visualização bruta: quem volta uma etapa
       e avança de novo conta duas vezes, e a taxa de conversão por etapa sai
       errada. A coluna sempre existiu na tabela e nunca era preenchida. */
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await supabase.from("quiz_events").insert({
      quiz_id: params.quizId,
      company_id: params.companyId,
      submission_id: params.submissionId ?? null,
      event_type: params.eventType,
      block_id: params.blockId ?? null,
      session_id: params.sessionId ?? null,
      payload: params.metadata ?? {},
    } as never);
  },

  /**
   * Visualizações de bloco com a sessão, para a nota de conversão por etapa.
   *
   * Só traz `block_view`: é o único evento emitido para TODA etapa. O
   * `block_advance` existe, mas só dispara em bloco com teste A/B ligado —
   * medido na base: zero linhas em toda a história da tabela.
   */
  async getStepViewEvents(
    quizId: string,
    days = 30,
  ): Promise<{ block_id: string | null; session_id: string | null }[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from("quiz_events")
      .select("block_id, session_id")
      .eq("quiz_id", quizId)
      .eq("event_type", "block_view")
      .gte("created_at", since)
      .limit(50000);
    if (error) {
      console.warn("Falha ao ler eventos de etapa", error);
      return [];
    }
    return (data as { block_id: string | null; session_id: string | null }[] | null) ?? [];
  },

  /**
   * TODAS as submissões do período, para exportar.
   *
   * A tela usa `listSubmissions(id, 100)` para a lista visível, e o CSV saía
   * desse mesmo recorte: quem tivesse 500 respostas exportava 100 e não era
   * avisado de nada. Aqui não há limite de 100 — e vêm as UTMs junto, que são
   * o motivo de exportar.
   */
  async getSubmissionsParaExport(quizId: string, days = 90) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from("quiz_submissions")
      .select("created_at, status, score, temperature, answers, tracking")
      .eq("quiz_id", quizId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw error;
    return (data ?? []) as unknown as Array<{
      created_at: string;
      status: string | null;
      score: number | null;
      temperature: string | null;
      answers: Record<string, unknown> | null;
      tracking: Record<string, unknown> | null;
    }>;
  },

  /**
   * Apaga TODOS os dados de resposta de um quiz, preservando o quiz.
   *
   * Existe para o funil que foi testado antes de ir ao ar: os números do teste
   * contaminam a análise e não há como separá-los depois. Não toca no esquema
   * nem nas versões — o funil continua igual, só sem histórico.
   */
  async resetarDados(
    quizId: string,
  ): Promise<{ submissoes: number; eventos: number; leads: number }> {
    // Contado antes de apagar, para o aviso dizer o que de fato saiu.
    const [subs, evs, lds] = await Promise.all([
      supabase
        .from("quiz_submissions")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", quizId),
      supabase
        .from("quiz_events")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", quizId),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id" as never, quizId),
    ]);
    const antes = {
      submissoes: subs.count ?? 0,
      eventos: evs.count ?? 0,
      leads: lds.count ?? 0,
    };
    // Leads primeiro: as submissões apontam para eles.
    await supabase
      .from("leads")
      .delete()
      .eq("quiz_id" as never, quizId);
    await supabase.from("quiz_events").delete().eq("quiz_id", quizId);
    await supabase.from("quiz_submissions").delete().eq("quiz_id", quizId);
    return antes;
  },

  /** Eventos e submissões crus para as métricas avançadas da Performance. */
  async getDadosAvancados(quizId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [{ data: eventos }, { data: submissoes }] = await Promise.all([
      supabase
        .from("quiz_events")
        .select("event_type, block_id, session_id, created_at")
        .eq("quiz_id", quizId)
        .gte("created_at", since)
        .limit(50000),
      supabase
        .from("quiz_submissions")
        .select("created_at, status, tracking")
        .eq("quiz_id", quizId)
        .gte("created_at", since)
        .limit(5000),
    ]);
    return {
      eventos: (eventos ?? []) as unknown as import("../lib/metricasAvancadas").EventoBruto[],
      submissoes: (submissoes ??
        []) as unknown as import("../lib/metricasAvancadas").SubmissaoBruta[],
    };
  },

  // ============ ANALYTICS ============
  async getMetrics(
    quizId: string,
    days = 30,
  ): Promise<{
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
        .from("quiz_events")
        .select("event_type, block_id, created_at")
        .eq("quiz_id", quizId)
        .gte("created_at", since),
      supabase
        .from("quiz_submissions")
        .select("id, score, temperature, answers, status, created_at, tracking")
        .eq("quiz_id", quizId)
        .gte("created_at", since),
      this.getLatestSchema(quizId),
    ]);

    const evs = (events ?? []) as Array<{
      event_type: string;
      block_id: string | null;
      created_at: string;
    }>;
    const subsData = (subs ?? []) as unknown as Array<{
      score: number | null;
      temperature: string | null;
      answers: Record<string, unknown> | null;
      status: string | null;
      created_at: string;
      tracking: Record<string, string> | null;
    }>;

    const starts = evs.filter((e) => e.event_type === "start").length;
    const completions = evs.filter((e) => e.event_type === "complete").length;
    const submissions = subsData.length;
    const leadsCaptured = subsData.filter((s) => {
      const c = (s.answers?._contact ?? {}) as { email?: string | null; phone?: string | null };
      return !!(c.email || c.phone);
    }).length;
    const conversionRate = starts > 0 ? (completions / starts) * 100 : 0;
    const scored = subsData.filter((s) => typeof s.score === "number");
    const avgScore =
      scored.length > 0 ? scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length : 0;

    const temperature = { hot: 0, warm: 0, cold: 0 };
    for (const s of subsData) {
      if (s.temperature === "hot") temperature.hot++;
      else if (s.temperature === "warm") temperature.warm++;
      else if (s.temperature === "cold") temperature.cold++;
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
      if (e.event_type === "start") bucket.starts++;
      else if (e.event_type === "complete") bucket.completions++;
    }
    const dailySeries = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

    const blockViews = new Map<string, number>();
    for (const e of evs) {
      if (e.event_type !== "block_view" || !e.block_id) continue;
      blockViews.set(e.block_id, (blockViews.get(e.block_id) ?? 0) + 1);
    }
    let previousViews = starts;
    const dropOffByBlock = schema.blocks.map((block) => {
      const views = blockViews.get(block.id) ?? 0;
      const dropRate =
        previousViews > 0 ? Math.max(0, ((previousViews - views) / previousViews) * 100) : 0;
      previousViews = views;
      return {
        blockId: block.id,
        label: block.title || block.resultTitle || block.type,
        views,
        dropRate,
      };
    });

    const utmMap = new Map<
      string,
      { campaign: string; source: string; submissions: number; completions: number }
    >();
    for (const s of subsData) {
      const t = s.tracking ?? {};
      const campaign = t.utm_campaign || "";
      const source = t.utm_source || "Direto";
      const key = `${campaign}::${source}`;
      const entry = utmMap.get(key) ?? {
        campaign: campaign || "Sem campanha",
        source,
        submissions: 0,
        completions: 0,
      };
      entry.submissions++;
      if (s.status === "completed") entry.completions++;
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

  async listSubmissions(
    quizId: string,
    limit = 100,
  ): Promise<
    Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      score: number | null;
      temperature: string | null;
      completed: boolean;
      created_at: string;
      /* As respostas vinham do banco e eram DESCARTADAS aqui. A tela chamada
         "Respostas" mostrava contato, pontos e temperatura — e nenhuma
         resposta. O dado sempre esteve na mesma consulta. */
      answers: Record<string, unknown> | null;
    }>
  > {
    const { data, error } = await supabase
      .from("quiz_submissions")
      .select("id, answers, score, temperature, status, created_at")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: false })
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
      const c = (r.answers?._contact ?? {}) as {
        email?: string | null;
        phone?: string | null;
        name?: string | null;
      };
      return {
        id: r.id,
        name: c.name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        score: r.score,
        temperature: r.temperature,
        completed: r.status === "completed",
        created_at: r.created_at,
        answers: r.answers,
      };
    });
  },

  /**
   * Números do cartão de cada quiz na lista.
   *
   * O denominador é quem COMEÇOU o quiz, não quantas submissões existem. Uma
   * submissão só nasce no fim, com `status: 'completed'` — então "concluídas
   * sobre submissões" dava quase sempre 100%, e o cartão dizia 100% de conclusão
   * para um funil em que a Análise media 12%. Dois números contraditórios na
   * mesma sessão, e o otimista era o que não significava nada.
   *
   * `starts` vem de `quiz_events`, a mesma fonte que `getMetrics` usa, e a
   * janela é a MESMA de 30 dias — senão o cartão diz 9% e a Análise 10% para o
   * mesmo funil, que é a mesma contradição de antes, só menor. O cartão diz na
   * tela que são 30 dias.
   */
  async getListStats(
    companyId: string,
    days = 30,
  ): Promise<Record<string, { total: number; completed: number; leadsCaptured: number }>> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [{ data, error }, { data: inicios }] = await Promise.all([
      supabase
        .from("quiz_submissions")
        .select("quiz_id, status, answers")
        .eq("company_id", companyId)
        .gte("created_at", since),
      supabase
        .from("quiz_events")
        .select("quiz_id")
        .eq("company_id", companyId)
        .eq("event_type", "start")
        .gte("created_at", since),
    ]);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      quiz_id: string;
      status: string | null;
      answers: Record<string, unknown> | null;
    }>;
    const stats: Record<string, { total: number; completed: number; leadsCaptured: number }> = {};
    const garantir = (id: string) => (stats[id] ??= { total: 0, completed: 0, leadsCaptured: 0 });

    for (const e of (inicios ?? []) as unknown as Array<{ quiz_id: string }>) {
      garantir(e.quiz_id).total++;
    }
    for (const r of rows) {
      const entry = garantir(r.quiz_id);
      if (r.status === "completed") entry.completed++;
      const c = (r.answers?._contact ?? {}) as { email?: string | null; phone?: string | null };
      if (c.email || c.phone) entry.leadsCaptured++;
      /* Quiz antigo, de antes de `start` ser gravado: sem nenhum início, a
         submissão vira o próprio denominador. É menos errado do que mostrar
         "—" para um funil que claramente teve gente. */
      if (!(inicios ?? []).length) entry.total++;
    }
    return stats;
  },

  async getAbTestStats(
    quizId: string,
    days = 30,
  ): Promise<
    Array<{
      blockId: string;
      blockLabel: string;
      variants: Array<{
        id: string;
        label: string;
        views: number;
        advances: number;
        conversionRate: number;
      }>;
    }>
  > {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [schema, { data: events, error }] = await Promise.all([
      this.getLatestSchema(quizId),
      supabase
        .from("quiz_events")
        .select("event_type, block_id, payload, created_at")
        .eq("quiz_id", quizId)
        .in("event_type", ["block_view", "block_advance"])
        .gte("created_at", since),
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
      variants: Array<{
        id: string;
        label: string;
        views: number;
        advances: number;
        conversionRate: number;
      }>;
    }> = [];

    for (const block of schema.blocks) {
      if (!block.abTest?.enabled || block.abTest.variants.length === 0) continue;
      const allVariants = [
        { id: "control", title: block.title },
        ...block.abTest.variants.map((v) => ({ id: v.id, title: v.title })),
      ];
      const variantStats = allVariants.map((v) => {
        const views = evs.filter(
          (e) =>
            e.block_id === block.id &&
            e.event_type === "block_view" &&
            (e.payload?.variant_id ?? "control") === v.id,
        ).length;
        const advances = evs.filter(
          (e) =>
            e.block_id === block.id &&
            e.event_type === "block_advance" &&
            (e.payload?.variant_id ?? "control") === v.id,
        ).length;
        return {
          id: v.id,
          label: v.id === "control" ? "Original" : v.title || "Variação",
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
