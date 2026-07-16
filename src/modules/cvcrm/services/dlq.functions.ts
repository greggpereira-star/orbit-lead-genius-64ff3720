import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const reprocessDlqSchema = z.object({
  dlqId: z.string().uuid(),
  companyId: z.string().uuid(),
});

interface SendCvcrmLeadResponse {
  success?: boolean;
  error?: string;
  trace_id?: string;
  cvcrm_lead_id?: string | null;
}

export const reprocessCvcrmDlqEntry = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reprocessDlqSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: dlqEntry, error: dlqError } = await supabase
      .from('cvcrm_dead_letter_queue')
      .select('id, company_id, lead_id, retry_count, resolved_at')
      .eq('id', data.dlqId)
      .eq('company_id', data.companyId)
      .maybeSingle();

    if (dlqError) {
      throw new Error(`Não foi possível carregar o item da DLQ: ${dlqError.message}`);
    }

    if (!dlqEntry) {
      throw new Error('Item da DLQ não encontrado para este workspace.');
    }

    if (dlqEntry.resolved_at) {
      return {
        success: true,
        message: 'Este item já estava marcado como resolvido.',
        traceId: null,
      };
    }

    const nextRetryCount = (dlqEntry.retry_count ?? 0) + 1;
    const traceId = crypto.randomUUID();

    const { error: updateError } = await supabase
      .from('cvcrm_dead_letter_queue')
      .update({ retry_count: nextRetryCount })
      .eq('id', dlqEntry.id)
      .eq('company_id', dlqEntry.company_id)
      .is('resolved_at', null);

    if (updateError) {
      throw new Error(`Não foi possível registrar a nova tentativa: ${updateError.message}`);
    }

    const { data: sendResult, error: sendError } = await supabase.functions.invoke<SendCvcrmLeadResponse>('send-cvcrm-lead', {
      body: {
        lead_id: dlqEntry.lead_id,
        tenant_id: dlqEntry.company_id,
        trace_id: traceId,
        source_dlq_id: dlqEntry.id,
      },
    });

    if (sendError) {
      return {
        success: false,
        message: sendError.message,
        traceId,
      };
    }

    if (!sendResult?.success) {
      return {
        success: false,
        message: sendResult?.error ?? 'A CV.CRM recusou a nova tentativa. O item permanece na DLQ.',
        traceId: sendResult?.trace_id ?? traceId,
      };
    }

    const { error: resolveError } = await supabase
      .from('cvcrm_dead_letter_queue')
      .update({ resolved_at: new Date().toISOString(), retry_count: nextRetryCount })
      .eq('id', dlqEntry.id)
      .eq('company_id', dlqEntry.company_id);

    if (resolveError) {
      throw new Error(`Entrega concluída, mas a DLQ não foi marcada como resolvida: ${resolveError.message}`);
    }

    return {
      success: true,
      message: 'Lead reenviado para a CV.CRM e DLQ resolvida.',
      traceId: sendResult.trace_id ?? traceId,
      cvcrmLeadId: sendResult.cvcrm_lead_id ?? null,
    };
  });