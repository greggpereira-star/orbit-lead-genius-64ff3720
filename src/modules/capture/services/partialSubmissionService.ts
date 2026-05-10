import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

export interface PartialSubmission {
  id?: string;
  company_id: string;
  form_id: string;
  form_slug: string;
  session_id: string;
  visitor_id?: string;
  lead_id?: string;
  current_step_id?: string;
  current_step_index: number;
  answers: Record<string, any>;
  tracking: Record<string, any>;
  score_preview: number;
  temperature_preview?: string;
  status: 'started' | 'in_progress' | 'abandoned' | 'completed' | 'expired';
}

const STORAGE_KEY_PREFIX = 'leadflow_partial_form_';

export const partialSubmissionService = {
  getLocalStorageKey(formId: string, sessionId: string) {
    return `${STORAGE_KEY_PREFIX}${formId}_${sessionId}`;
  },

  async savePartial(data: PartialSubmission): Promise<string | null> {
    try {
      // Save to localStorage
      const localKey = this.getLocalStorageKey(data.form_id, data.session_id);
      localStorage.setItem(localKey, JSON.stringify({
        ...data,
        updated_at: new Date().toISOString()
      }));

      // Save to Supabase (Upsert based on session_id + form_id)
      const { data: saved, error } = await supabase
        .from('form_partial_submissions')
        .upsert({
          company_id: data.company_id,
          form_id: data.form_id,
          form_slug: data.form_slug,
          session_id: data.session_id,
          visitor_id: data.visitor_id,
          current_step_index: data.current_step_index,
          answers: data.answers,
          tracking: data.tracking,
          score_preview: data.score_preview,
          temperature_preview: data.temperature_preview,
          status: data.status,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id,form_id'
        })
        .select()
        .single();

      if (error) {
        // If upsert fails because we don't have a unique constraint on session_id,form_id yet
        // we'll just insert or find first.
        logger.warn('PartialSubmission: Upsert might have failed, trying standard insert', { error });
        const { data: inserted, error: insError } = await supabase
          .from('form_partial_submissions')
          .insert({
             ...data,
             updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        return inserted?.id || null;
      }

      return saved?.id || null;
    } catch (err) {
      logger.error('Failed to save partial submission', { err });
      return null;
    }
  },

  async getPartial(formId: string, sessionId: string): Promise<PartialSubmission | null> {
    // Try localStorage first for speed
    const localKey = this.getLocalStorageKey(formId, sessionId);
    const localData = localStorage.getItem(localKey);
    if (localData) {
      try { return JSON.parse(localData); } catch (e) {}
    }

    // Fallback to Supabase
    const { data, error } = await supabase
      .from('form_partial_submissions')
      .select('*')
      .eq('form_id', formId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch partial submission', { error, formId, sessionId });
      return null;
    }

    return data;
  },

  async markAsCompleted(formId: string, sessionId: string): Promise<void> {
    const localKey = this.getLocalStorageKey(formId, sessionId);
    localStorage.removeItem(localKey);

    await supabase
      .from('form_partial_submissions')
      .update({ status: 'completed' })
      .eq('form_id', formId)
      .eq('session_id', sessionId);
  }
};
