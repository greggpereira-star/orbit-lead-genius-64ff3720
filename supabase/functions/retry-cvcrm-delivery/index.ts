import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MAX_ATTEMPTS = 5;

serve(async () => {
  const traceId = crypto.randomUUID();
  console.log(`[retry-cvcrm-delivery] [${traceId}] Starting retry worker`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: retries, error: fetchError } = await supabaseAdmin
      .from('cvcrm_delivery_logs')
      .select('id, lead_id, company_id, attempt_count, request_payload, error_message')
      .eq('status', 'retrying')
      .lt('next_retry_at', new Date().toISOString())
      .limit(20);

    if (fetchError) throw fetchError;

    console.log(`[retry-cvcrm-delivery] [${traceId}] Found ${retries?.length || 0} leads to retry`);

    const results: Array<{ id: string; outcome: string }> = [];

    for (const item of (retries || [])) {
      const nextAttempt = (item.attempt_count || 0) + 1;

      // Enforce max attempts → move to DLQ
      if (nextAttempt > MAX_ATTEMPTS) {
        await supabaseAdmin.from('cvcrm_delivery_logs')
          .update({ status: 'dead_letter' })
          .eq('id', item.id);

        await supabaseAdmin.from('cvcrm_dead_letter_queue').insert({
          company_id: item.company_id,
          lead_id: item.lead_id,
          trace_id: traceId,
          delivery_log_id: item.id,
          failure_reason: `Max retries exceeded (${MAX_ATTEMPTS})`,
          payload: item.request_payload,
          last_error: item.error_message
        });

        results.push({ id: item.id, outcome: 'dead_letter' });
        continue;
      }

      await supabaseAdmin.from('cvcrm_delivery_logs')
        .update({ attempt_count: nextAttempt, status: 'sending' })
        .eq('id', item.id);

      const { data, error } = await supabaseAdmin.functions.invoke('send-cvcrm-lead', {
        body: { lead_id: item.lead_id, tenant_id: item.company_id, trace_id: traceId }
      });

      results.push({
        id: item.id,
        outcome: !error && data?.success ? 'success' : 'retry_scheduled'
      });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[retry-cvcrm-delivery] [${traceId}] Error: `, (error as Error).message);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
})
