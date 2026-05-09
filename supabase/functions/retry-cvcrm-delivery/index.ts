import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const traceId = crypto.randomUUID();
  console.log(`[retry-cvcrm-delivery] [${traceId}] Starting retry worker`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find logs needing retry
    const { data: retries, error: fetchError } = await supabaseAdmin
      .from('cvcrm_delivery_logs')
      .select('id, lead_id, company_id, attempt_count')
      .eq('status', 'retrying')
      .lt('next_retry_at', new Date().toISOString())
      .limit(10);

    if (fetchError) throw fetchError;

    console.log(`[retry-cvcrm-delivery] [${traceId}] Found ${retries?.length || 0} leads to retry`);

    const results = [];
    for (const item of (retries || [])) {
      // Increment attempt count
      await supabaseAdmin.from('cvcrm_delivery_logs')
        .update({ attempt_count: (item.attempt_count || 0) + 1, status: 'sending' })
        .eq('id', item.id);

      // Trigger sync function
      const { data, error } = await supabaseAdmin.functions.invoke('send-cvcrm-lead', {
        body: { lead_id: item.lead_id, tenant_id: item.company_id }
      });

      results.push({ id: item.id, success: !error && data?.success });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[retry-cvcrm-delivery] [${traceId}] Error: `, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
})
