import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

export interface Form {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  type: 'traditional' | 'multi-step' | 'quiz' | 'conversational';
  settings: {
    submit_label: string;
    success_message: string;
    redirect_url?: string;
    whatsapp_number?: string;
    theme: string;
    cv_crm_integration: boolean;
    capture_utms: boolean;
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
  step_number: number;
  logic_rules?: any;
  score_rules?: any;
}

export const formService = {
  async getForms(tenantId: string): Promise<Form[]> {
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch forms', { error, tenantId });
      throw error;
    }
    return data;
  },

  async getFormById(id: string): Promise<Form & { form_fields: FormField[] } | null> {
    const { data, error } = await supabase
      .from('forms')
      .select('*, form_fields(*)')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Failed to fetch form by id', { error, id });
      throw error;
    }
    return data;
  },

  async getFormBySlug(slug: string): Promise<Form & { form_fields: FormField[] } | null> {
    const { data, error } = await supabase
      .from('forms')
      .select('*, form_fields(*)')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch form by slug', { error, slug });
      throw error;
    }
    return data;
  },

   async createForm(tenantId: string, form: Partial<Form>, fields: Partial<FormField>[]): Promise<Form> {
     const processedFields = fields.map((f, index) => ({
       label: f.label || 'Untitled Field',
       name: f.name || (f.label || 'field').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_'),
       type: f.type || 'text',
       required: !!f.required,
       placeholder: f.placeholder || '',
       options: f.options || [],
       sort_order: index,
       step_number: f.step_number || 1,
       validation_rules: f.validation_rules || {},
       logic_rules: f.logic_rules || {},
       score_rules: f.score_rules || {}
     }));
 
      const payload = {
        p_tenant_id: tenantId,
        p_form_data: {
          name: form.name,
          slug: form.slug,
          status: form.status,
          type: form.type,
          settings: form.settings,
          description: form.description
        },
        p_fields: processedFields
      };

      logger.info('Creating form with RPC', { tenantId, payload });

      const { data: newFormId, error } = await supabase.rpc('create_form_with_fields', payload);
 
     if (error) {
       logger.error('Failed to create form with RPC', { error });
       throw error;
     }
 
     const formResult = await this.getFormById(newFormId);
     if (!formResult) throw new Error('Failed to retrieve created form');
     return formResult;
   },
 
  async updateForm(formId: string, form: Partial<Form>, fields: Partial<FormField>[]): Promise<void> {
    const processedFields = fields.map((f, index) => ({
      label: f.label || 'Untitled Field',
      name: f.name || (f.label || 'field').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_'),
      type: f.type || 'text',
      required: !!f.required,
      placeholder: f.placeholder || '',
      options: Array.isArray(f.options) ? f.options : [],
      sort_order: index,
      step_number: f.step_number || 1,
      validation_rules: f.validation_rules || {},
      logic_rules: f.logic_rules || {},
      score_rules: f.score_rules || {}
    }));

    const payload = {
      p_form_id: formId,
      p_form_data: {
        name: form.name,
        slug: form.slug,
        status: form.status,
        type: form.type,
        settings: form.settings,
        description: form.description
      },
      p_fields: processedFields
    };

    logger.info('Updating form with RPC', { formId, payload });

    const { error } = await supabase.rpc('update_form_with_fields', payload);

    if (error) {
      logger.error('Failed to update form with RPC', { error, formId });
      // Provide a more descriptive error message if possible
      if (error.code === '23505') {
        throw new Error('This slug is already in use by another form. Please choose a different one.');
      }
      throw error;
    }
  },

  async deleteForm(formId: string): Promise<void> {
    const { error } = await supabase.from('forms').delete().eq('id', formId);
    if (error) throw error;
  }
};