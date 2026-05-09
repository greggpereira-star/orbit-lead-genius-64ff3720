import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const traceId = crypto.randomUUID();
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: integrations, error } = await supabaseAdmin
      .from('cvcrm_integrations')
      .select('company_id')
      .eq('is_active', true);

    if (error) throw error;

    const results = [];
    for (const integration of (integrations || [])) {
      const { data, error: testError } = await supabaseAdmin.functions.invoke('test-cvcrm-connection', {
        body: { tenant_id: integration.company_id }
      });
      results.push({ company_id: integration.company_id, success: !testError && data?.success });
    }

    return new Response(JSON.stringify({ success: true, checked: results.length, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
})
