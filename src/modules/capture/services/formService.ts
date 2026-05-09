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
    const { data: newForm, error: formError } = await supabase
      .from('forms')
      .insert({
        tenant_id: tenantId,
        name: form.name || 'Untitled Form',
        slug: form.slug || `form-${Math.random().toString(36).substr(2, 9)}`,
        type: form.type || 'traditional',
        settings: form.settings || {
          submit_label: 'Submit',
          success_message: 'Thank you!',
          theme: 'premium-light',
          cv_crm_integration: false,
          capture_utms: true
        }
      })
      .select()
      .single();

    if (formError) throw formError;

    if (fields.length > 0) {
      const fieldsWithFormId = fields.map((f, index) => ({
        ...f,
        form_id: newForm.id,
        sort_order: f.sort_order ?? index
      }));

      const { error: fieldsError } = await supabase
        .from('form_fields')
        .insert(fieldsWithFormId);

      if (fieldsError) throw fieldsError;
    }

    return newForm;
  },

   async updateForm(formId: string, form: Partial<Form>, fields: Partial<FormField>[]): Promise<void> {
     const { id, tenant_id, created_at, updated_at, form_fields, ...updateData } = form as any;
 
    const { error: formError } = await supabase
      .from('forms')
       .update(updateData)
      .eq('id', formId);

    if (formError) throw formError;

    if (fields && fields.length > 0) {
      await supabase.from('form_fields').delete().eq('form_id', formId);
      
      const fieldsWithFormId = fields.map((f, index) => ({
        label: f.label,
        name: f.name || f.label?.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        type: f.type,
        required: !!f.required,
        placeholder: f.placeholder,
        form_id: formId,
        sort_order: index,
        step_number: f.step_number || 1
      }));

      const { error: fieldsError } = await supabase
        .from('form_fields')
        .insert(fieldsWithFormId);

      if (fieldsError) throw fieldsError;
    }
  },

  async deleteForm(formId: string): Promise<void> {
    const { error } = await supabase.from('forms').delete().eq('id', formId);
    if (error) throw error;
  }
};