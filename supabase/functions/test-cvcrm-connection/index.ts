import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const traceId = crypto.randomUUID();
  console.log(`[test-cvcrm-connection] [${traceId}] Started validation request`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { tenant_id } = await req.json()
    if (!tenant_id) throw new Error('tenant_id is required');

    const { data: config, error: configError } = await supabaseAdmin
      .from('cvcrm_integrations')
      .select('*')
      .eq('company_id', tenant_id)
      .single()

    if (configError || !config) throw new Error('Integration settings not found');

    const startTime = Date.now();
    const apiUrl = `https://${config.subdomain}.cvcrm.com.br/api/cv/situacao`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'token': config.encrypted_api_token,
        'email': config.integration_user
      }
    })

    const latency = Date.now() - startTime;
    const result = response.ok ? await response.json() : null;

    // Update status in DB
    await supabaseAdmin
      .from('cvcrm_integrations')
      .update({
        connection_status: response.ok ? 'connected' : 'failed',
        last_tested_at: new Date().toISOString(),
        last_success_at: response.ok ? new Date().toISOString() : config.last_success_at,
        last_error_at: !response.ok ? new Date().toISOString() : config.last_error_at,
        last_error_message: response.ok ? null : `Status: ${response.status}`
      })
      .eq('company_id', tenant_id)

    // Audit log
    await supabaseAdmin.from('integration_audit_logs').insert({
      company_id: tenant_id,
      provider: 'cvcrm',
      event_type: 'test_connection',
      status: response.ok ? 'success' : 'failed',
      payload: { latency_ms: latency, status_code: response.status },
      trace_id: traceId
    });

    if (!response.ok) {
      let friendlyError = 'Invalid credentials or subdomain';
      if (response.status === 401) friendlyError = 'Invalid API Token or User';
      if (response.status === 404) friendlyError = 'Subdomain not found (check base URL)';
      throw new Error(friendlyError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      latency_ms: latency,
      message: 'Connection successful'
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error(`[test-cvcrm-connection] [${traceId}] Error: `, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message, trace_id: traceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
