import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

/**
 * Rascunho do formulário — o que a pessoa já digitou antes de enviar.
 *
 * Passava por leitura e escrita diretas em `form_partial_submissions`. As
 * políticas RLS `{anon}` daquela tabela existem, mas eram letra morta: medido
 * em 04/10/2026, o papel `anon` não tem grant nenhum ali, e política sem
 * privilégio não autoriza nada. Agora vai por função `SECURITY DEFINER`, que
 * só toca a linha daquela sessão.
 *
 * O `localStorage` continua como cache de leitura, porque responde na hora e
 * preenche o formulário antes do primeiro ida-e-volta à rede. Ele não é a
 * fonte da verdade: o `score_preview` e o status vêm do servidor.
 */
export interface PartialSubmission {
  id?: string;
  company_id?: string;
  form_id?: string;
  form_slug?: string;
  session_id?: string;
  visitor_id?: string;
  lead_id?: string;
  current_step_index: number;
  answers: Record<string, any>;
  tracking?: Record<string, any>;
  score_preview?: number;
  temperature_preview?: string;
  status?: 'started' | 'in_progress' | 'abandoned' | 'completed' | 'expired';
}

const STORAGE_KEY_PREFIX = 'leadflow_partial_form_';

export const partialSubmissionService = {
  getLocalStorageKey(formId: string, sessionId: string) {
    return `${STORAGE_KEY_PREFIX}${formId}_${sessionId}`;
  },

  async savePartial(p: {
    slug: string;
    formId: string;
    sessionId: string;
    answers: Record<string, any>;
    stepIndex: number;
    tracking?: Record<string, any>;
    visitorId?: string;
  }): Promise<{ score: number; temperature: string } | null> {
    try {
      localStorage.setItem(
        this.getLocalStorageKey(p.formId, p.sessionId),
        JSON.stringify({
          current_step_index: p.stepIndex,
          answers: p.answers,
          updated_at: new Date().toISOString(),
        }),
      );
    } catch {
      /* Aba privada ou armazenamento bloqueado: o rascunho vive no servidor. */
    }

    const { data, error } = await (supabase as any).rpc('form_rascunho_salvar', {
      p_slug: p.slug,
      p_session_id: p.sessionId,
      p_answers: p.answers ?? {},
      p_step_index: p.stepIndex,
      p_tracking: p.tracking ?? {},
      p_visitor_id: p.visitorId ?? null,
    });

    if (error) {
      logger.warn('Falha ao gravar rascunho do formulário', { error: error.message, slug: p.slug });
      return null;
    }
    const r = (data ?? {}) as Record<string, any>;
    return r.ok ? { score: r.score ?? 0, temperature: r.temperature ?? 'cold' } : null;
  },

  async getPartial(
    slug: string,
    formId: string,
    sessionId: string,
  ): Promise<PartialSubmission | null> {
    const { data, error } = await (supabase as any).rpc('form_rascunho_ler', {
      p_slug: slug,
      p_session_id: sessionId,
    });

    if (!error && data) return data as PartialSubmission;
    if (error) {
      logger.warn('Falha ao ler rascunho do formulário', { error: error.message, slug });
    }

    // Queda para o cache local: a pessoa não perde o que digitou só porque a
    // rede falhou.
    try {
      const local = localStorage.getItem(this.getLocalStorageKey(formId, sessionId));
      return local ? (JSON.parse(local) as PartialSubmission) : null;
    } catch {
      return null;
    }
  },

  /**
   * O rascunho é fechado pelo próprio `form_submit_publico`, na mesma
   * transação do lead — então não há janela em que o lead exista e o rascunho
   * continue contando como abandono. Aqui só resta limpar o cache local.
   */
  clearLocal(formId: string, sessionId: string): void {
    try {
      localStorage.removeItem(this.getLocalStorageKey(formId, sessionId));
    } catch {
      /* sem cache para limpar */
    }
  },
};
