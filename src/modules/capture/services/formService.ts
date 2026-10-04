import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

export interface Form {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
   type: 'standard' | 'multi_step' | 'quiz' | 'conversational';
  settings: {
    submit_label: string;
    success_message: string;
    redirect_url?: string;
    whatsapp_number?: string;
    theme: string;
    cv_crm_integration: boolean;
    capture_utms: boolean;
    /** Etapa do pipeline onde o lead entra. Ausente = etapa padrão do funil. */
    default_stage_id?: string;
    /* Medição só deste formulário. Ausente = herda o pixel da empresa. */
    meta_pixel_id?: string;
    google_conversion_id?: string;
    google_lead_label?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  form_id: string;
  label: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: any[];
  validation_rules?: any;
    sort_order: number;
    step_number?: number;
    step_id?: string;
    logic_rules?: any;
    score_rules?: any;
  }
 
 export interface FormFieldOption {
   id: string;
   field_id: string;
   company_id: string;
   form_id: string;
   label: string;
   value: string;
   score: number;
   tag?: string | null;
   sort_order: number;
   metadata?: any;
 }
 
 export interface FormStep {
   id: string;
   form_id: string;
   title: string;
   description?: string;
   sort_order: number;
   button_text: string;
   conditional_logic?: any;
 }
 
 export interface ScoringRule {
   id: string;
   form_id: string;
   field_id: string;
   condition_value: string;
   score_points: number;
 }

export const formService = {
  async getForms(tenantId: string): Promise<Form[]> {
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('company_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch forms', { error, tenantId });
      throw error;
    }
    return data;
  },

    async getFormById(id: string): Promise<Form & { 
      form_fields: (FormField & { options_data?: FormFieldOption[] })[], 
      form_steps: FormStep[], 
      scoring_rules: ScoringRule[] 
    } | null> {
      const { data, error } = await supabase
        .from('forms')
        .select('*, form_fields(*), form_steps(*), form_scoring_rules(*), form_field_options(*)')
        .eq('id', id)
        .single();

    if (error) {
      logger.error('Failed to fetch form by id', { error, id });
      throw error;
    }
      if (data) {
        // Vincular options_data aos campos correspondentes
        const fieldsWithOptions = data.form_fields.map((field: any) => ({
          ...field,
          options_data: (data.form_field_options || []).filter((opt: any) => opt.field_id === field.id)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
        }));
        return { ...data, form_fields: fieldsWithOptions };
      }
      return data;
    },

  /**
   * Formulário publicado, para o visitante anônimo.
   *
   * Lia a tabela direto, e o papel `anon` não tem grant em `forms` — medido em
   * 04/10/2026: `permission denied for table forms`. O formulário público
   * nunca renderizava. Agora vai pela função `form_publico`, que roda como
   * dono e devolve só o que a página precisa (sem as regras de pontuação, que
   * são a régua de qualificação do cliente).
   */
  async getFormBySlug(slug: string): Promise<Form & { form_fields: FormField[], form_steps: FormStep[] } | null> {
    const { data, error } = await (supabase as any).rpc('form_publico', { p_chave: slug });

    if (error) {
      logger.error('Falha ao buscar formulário público pelo slug', { error, slug });
      throw error;
    }
    return (data as Form & { form_fields: FormField[]; form_steps: FormStep[] }) ?? null;
  },

  /**
   * Mesma leitura pública, mas pela chave que a tela de publicação entrega.
   *
   * `FormPublish` monta todos os trechos de instalação com o UUID, e o
   * `sdk.js` manda UUID para `/embed-form/<id>`. Esse caminho continuava lendo
   * a tabela `forms` direto depois da correção de 04/10 — e `anon` não tem
   * grant nela. `form_publico` aceita slug ou id; aqui é o mesmo RPC.
   */
  async getPublicForm(chave: string): Promise<Form & { form_fields: FormField[], form_steps: FormStep[] } | null> {
    return this.getFormBySlug(chave);
  },

   async createForm(
     tenantId: string, 
     form: Partial<Form>, 
     fields: Partial<FormField>[], 
     steps: Partial<FormStep>[] = [],
     scoringRules: Partial<ScoringRule>[] = []
   ): Promise<Form> {
      const processedFields = fields.map((f, index) => ({
        label: f.label || 'Untitled Field',
        name: f.name || (f.label || 'field').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_'),
        type: f.type || 'text',
        required: !!f.required,
        placeholder: f.placeholder || '',
        options: Array.isArray(f.options) ? f.options : [],
        sort_order: f.sort_order !== undefined ? f.sort_order : index,
        step_number: f.step_number || 1,
        step_id: f.step_id,
        validation_rules: f.validation_rules || {},
        logic_rules: f.logic_rules || {},
        score_rules: f.score_rules || {}
      }));
 
     const payload = {
       p_tenant_id: tenantId,
       p_form_data: {
         name: form.name,
         slug: form.slug,
         status: form.status || 'draft',
         type: form.type || 'standard',
         settings: form.settings,
         description: form.description
       },
       p_fields: processedFields
     };
 
     logger.info('Creating form with RPC', { tenantId, slug: form.slug });
 
    const { data: formId, error } = await supabase.rpc('create_form_with_fields', payload);
 
    if (error) {
      logger.error('Failed to create form with RPC', { error, tenantId });
      if (error.code === '23505') {
        throw new Error('Este slug já está em uso. Por favor, escolha outro.');
      }
      throw error;
    }
 
    // Optimized: return a partial form object immediately to avoid extra roundtrip
    // React Query will refetch the list if needed, or we can return the ID
     const { data: newForm, error: fetchError } = await supabase
       .from('forms')
       .select('*')
       .eq('id', formId)
       .single();
 
     if (fetchError) throw fetchError;
     return newForm;
   },
 
    // Novo salvamento modular por camadas
    async saveFormCore(p: { 
      formId?: string, 
      companyId: string, 
      name: string, 
      slug: string, 
      description?: string, 
      status: string, 
      settings: any,
      type?: string 
    }): Promise<string> {
      const { data, error } = await supabase.rpc('save_form_core_v1', {
        p_form_id: p.formId,
        p_company_id: p.companyId,
        p_name: p.name,
        p_slug: p.slug,
        p_description: p.description,
        p_status: p.status,
        p_settings: p.settings,
        p_type: p.type || 'standard'
      });
      if (error) throw error;
      return data;
    },

    async saveFormFieldsDelta(p: {
      formId: string,
      companyId: string,
      fieldsUpsert: any[],
      fieldsDelete: string[]
    }): Promise<void> {
      const { error } = await supabase.rpc('save_form_fields_delta_v1', {
        p_form_id: p.formId,
        p_company_id: p.companyId,
        p_fields_upsert: p.fieldsUpsert,
        p_fields_delete: p.fieldsDelete
      });
      if (error) throw error;
    },

    async saveFieldOptionsBatch(p: {
      formId: string,
      companyId: string,
      optionsByField: any[]
    }): Promise<void> {
      const { error } = await supabase.rpc('save_form_options_batch_v1' as any, {
        p_form_id: p.formId,
        p_company_id: p.companyId,
        p_options_by_field: p.optionsByField
      });
      if (error) throw error;
    },

    async saveFieldOptionsDelta(p: {
      formId: string,
      companyId: string,
      fieldId: string,
      optionsUpsert: any[],
      optionsDelete: string[]
    }): Promise<void> {
      const { error } = await supabase.rpc('save_form_options_delta_v1', {
        p_form_id: p.formId,
        p_company_id: p.companyId,
        p_field_id: p.fieldId,
        p_options_upsert: p.optionsUpsert,
        p_options_delete: p.optionsDelete
      });
      if (error) throw error;
    },

    async saveFormBuilder(p: {
      formId?: string,
      companyId: string,
      formData: any,
      fields: any[],
      steps?: any[],
      optionsByField: any[]
    }): Promise<{ form_id: string; trace_id: string; fields: number; options: number; duration_ms: number }> {
      const { data, error } = await supabase.rpc('save_form_builder_v1' as any, {
        p_form_id: p.formId || null,
        p_company_id: p.companyId,
        p_form_data: p.formData,
        p_fields: p.fields,
        p_steps: p.steps || [],
        p_options_by_field: p.optionsByField
      });
      if (error) {
        /* 23505 no índice de chave do campo vira uma frase que diz o que
           fazer. A mensagem crua do Postgres fala em "duplicate key value
           violates unique constraint form_fields_form_name_uniq", que não
           ajuda quem está montando o formulário. */
        if (error.code === '23505' && error.message?.includes('form_fields_form_name_uniq')) {
          throw new Error(
            'Dois campos estão com a mesma chave de resposta. Abra a chave abaixo do rótulo e deixe uma diferente.',
          );
        }
        throw error;
      }
      return data as any;
    },

  async deleteForm(formId: string): Promise<void> {
    const { error } = await supabase.from('forms').delete().eq('id', formId);
    if (error) throw error;
  }
};
/* ------------------------------------------------------------------------
   Números reais dos formulários.

   O que havia nas telas era inventado: "1.284 eventos", "18.5%", "João
   Silva", e `0`/`0%` literais no cartão de cada formulário. Dado inventado
   num produto é pior que tela vazia — o cliente lê como se fosse o número
   dele.
   ------------------------------------------------------------------------ */

export interface MetricaDeFormulario {
  form_id: string;
  enviados: number;
  iniciados: number;
  abandonados: number;
  taxa_de_conclusao: number;
  ultimo_envio: string | null;
}

export interface SubmissaoDeFormulario {
  id: string;
  lead_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  score: number | null;
  temperatura: string | null;
  etiquetas: string[] | null;
  respostas: Record<string, unknown> | null;
  utm_source: string | null;
  utm_campaign: string | null;
  criado_em: string;
  total: number;
}

export interface AtividadeDeFormulario {
  tipo: 'enviado' | 'abandonado' | 'preenchendo';
  quando: string;
  passo: number | null;
  score: number | null;
  temperatura: string | null;
  identificacao: string | null;
}

export const formMetrics = {
  async porEmpresa(companyId: string): Promise<Record<string, MetricaDeFormulario>> {
    const { data, error } = await (supabase as any).rpc('metricas_dos_formularios', {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    const mapa: Record<string, MetricaDeFormulario> = {};
    for (const m of (data ?? []) as MetricaDeFormulario[]) mapa[m.form_id] = m;
    return mapa;
  },

  async submissoes(p: {
    formId: string;
    busca?: string;
    limite?: number;
    offset?: number;
  }): Promise<SubmissaoDeFormulario[]> {
    const { data, error } = await (supabase as any).rpc('submissoes_do_formulario', {
      p_form_id: p.formId,
      p_busca: p.busca ?? null,
      p_limite: p.limite ?? 50,
      p_offset: p.offset ?? 0,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as SubmissaoDeFormulario[];
  },

  async atividade(formId: string, limite = 25): Promise<AtividadeDeFormulario[]> {
    const { data, error } = await (supabase as any).rpc('atividade_do_formulario', {
      p_form_id: formId,
      p_limite: limite,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as AtividadeDeFormulario[];
  },
};

/**
 * CSV de verdade.
 *
 * Os botões antigos emitiam `toast.info` e, 2 segundos depois,
 * `toast.success('Exportação concluída')` — sem gerar arquivo nenhum.
 *
 * As colunas das respostas saem da união das chaves presentes: formulário que
 * mudou de campos ao longo do tempo tem submissões com conjuntos diferentes, e
 * fixar as colunas do formulário ATUAL perderia o que foi respondido antes.
 */
export function submissoesParaCsv(linhas: SubmissaoDeFormulario[]): string {
  const chavesDeResposta = Array.from(
    new Set(linhas.flatMap((l) => Object.keys(l.respostas ?? {}))),
  ).sort();

  const cabecalho = [
    'data', 'nome', 'email', 'telefone', 'score', 'temperatura',
    'etiquetas', 'utm_source', 'utm_campaign', ...chavesDeResposta,
  ];

  // Aspas duplicadas e o campo todo entre aspas: é o que faz vírgula, quebra
  // de linha e aspas dentro do texto não partirem a coluna no Excel.
  const campo = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const corpo = linhas.map((l) => [
    new Date(l.criado_em).toLocaleString('pt-BR'),
    l.nome, l.email, l.telefone, l.score, l.temperatura,
    (l.etiquetas ?? []).join('; '),
    l.utm_source, l.utm_campaign,
    ...chavesDeResposta.map((k) => {
      const v = (l.respostas ?? {})[k];
      return Array.isArray(v) ? v.join('; ') : v;
    }),
  ].map(campo).join(','));

  // BOM para o Excel reconhecer UTF-8 — sem ele "orçamento" vira "orÃ§amento".
  return '﻿' + [cabecalho.map(campo).join(','), ...corpo].join('\r\n');
}

export function baixarCsv(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
