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
   step_id?: string;
   logic_rules?: any;
   score_rules?: any;
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

   async getFormById(id: string): Promise<Form & { form_fields: FormField[], form_steps: FormStep[], scoring_rules: ScoringRule[] } | null> {
     const { data, error } = await supabase
       .from('forms')
       .select('*, form_fields(*), form_steps(*), form_scoring_rules(*)')
       .eq('id', id)
       .single();

    if (error) {
      logger.error('Failed to fetch form by id', { error, id });
      throw error;
    }
    return data;
  },

   async getFormBySlug(slug: string): Promise<Form & { form_fields: FormField[], form_steps: FormStep[] } | null> {
     const { data, error } = await supabase
       .from('forms')
       .select('*, form_fields(*), form_steps(*)')
       .eq('slug', slug)
       .eq('status', 'published')
       .maybeSingle();

    if (error) {
      logger.error('Failed to fetch form by slug', { error, slug });
      throw error;
    }
    return data;
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
       sort_order: index,
       step_number: f.step_id ? 1 : 1, // Fallback logic if step_id is used
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
 
  async updateForm(formId: string, form: Partial<Form>, fields: Partial<FormField>[]): Promise<void> {
    const processedFields = fields.map((f, index) => ({
      label: f.label || 'Untitled Field',
      name: f.name || (f.label || 'field').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_'),
      type: f.type || 'text',
      required: !!f.required,
      placeholder: f.placeholder || '',
      options: Array.isArray(f.options) ? f.options : [],
      sort_order: index,
       step_id: f.step_id,
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

     logger.info('Updating form with RPC', { 
       formId, 
       slug: form.slug,
       redirect_url: form.settings?.redirect_url,
       fieldCount: fields.length 
     });

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