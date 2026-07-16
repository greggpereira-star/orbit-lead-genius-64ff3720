import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let traceId = crypto.randomUUID();
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { lead_id, tenant_id, trace_id, source_dlq_id } = await req.json()
    if (!lead_id || !tenant_id) throw new Error('lead_id and tenant_id are required');
    if (typeof trace_id === 'string' && trace_id.trim().length > 0) {
      traceId = trace_id;
    }

    console.log(`[send-cvcrm-lead] [${traceId}] Processing lead ${lead_id} for tenant ${tenant_id}`);

    // 1. Load Integration
    const { data: config, error: configError } = await supabaseAdmin
      .from('cvcrm_integrations')
      .select('*')
      .eq('company_id', tenant_id)
      .eq('is_active', true)
      .single()

    if (configError || !config) throw new Error('Active CV.CRM integration not found for this tenant');

    // 2. Load Lead & Tracking
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) throw new Error('Lead not found');

    // 3. Idempotency Check
    const idempotencyKey = `cvcrm-${tenant_id}-${lead_id}`;
    const { data: existingLog } = await supabaseAdmin
      .from('cvcrm_delivery_logs')
      .select('status, cvcrm_lead_id')
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'success')
      .maybeSingle();

    if (existingLog) {
      console.log(`[send-cvcrm-lead] [${traceId}] Lead already synced successfully. ID: ${existingLog.cvcrm_lead_id}`);
      return new Response(JSON.stringify({ success: true, message: 'Already synced', cvcrm_lead_id: existingLog.cvcrm_lead_id }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 4. Map Fields
    // Main fields
    const cvPayload: any = {
      nome: lead.name,
      email: lead.email,
      telefone: lead.phone,
      origem: lead.source || 'LeadFlow',
      id_empreendimento: lead.metadata?.id_empreendimento || lead.metadata?.product_id || null,
    };

    // Tracking / UTMs as Custom Fields (as requested)
    // Mapping keys from the request spec
    const trackingFields = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'gclid', 'gbraid', 'wbraid', 'fbclid', 'referrer', 'landing_page', 'page_url',
      'form_slug', 'form_name', 'lead_source', 'source_channel', 'device', 'browser',
      'session_id', 'lead_score', 'lead_temperature', 'capture_origin',
      'ecommerce_product_name', 'ecommerce_product_id', 'ecommerce_cart_value'
    ];

    trackingFields.forEach(field => {
      const val = lead[field] || lead.metadata?.[field];
      if (val) {
        // CV.CRM usually accepts custom fields in a specific format or prefixed
        // Based on the user instruction "campo_personalizado_utm_source"
        cvPayload[`campo_personalizado_${field}`] = val;
      }
    });

    // 5. Send to CV.CRM
    const startTime = Date.now();
    const apiUrl = `https://${config.cvcrm_base_url}.cvcrm.com.br/api/cv/lead`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': config.api_token,
        'email': config.api_user
      },
      body: JSON.stringify(cvPayload)
    });

    const latency = Date.now() - startTime;
    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw_response: responseText };
    }

    // 6. Register Log
    const { data: logRecord, error: logError } = await supabaseAdmin
      .from('cvcrm_delivery_logs')
      .insert({
        company_id: tenant_id,
        lead_id: lead_id,
        trace_id: traceId,
        idempotency_key: idempotencyKey,
        status: response.ok ? 'success' : 'failed',
        request_payload: cvPayload,
        response_payload: result,
        status_code: response.status,
        error_message: response.ok ? null : JSON.stringify(result),
        cvcrm_lead_id: result.id_lead || result.id || null,
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    // 7. Update Lead status
    if (response.ok) {
      await supabaseAdmin
        .from('leads')
        .update({
          cvcrm_id: result.id_lead || result.id,
          sync_status: 'synced',
          last_sync_at: new Date().toISOString()
        })
        .eq('id', lead_id);
      
      // Timeline Event
      await supabaseAdmin.from('lead_timeline_events').insert({
        company_id: tenant_id,
        lead_id: lead_id,
        event_type: 'cvcrm_delivery_success',
        metadata: { cvcrm_lead_id: result.id_lead || result.id, latency_ms: latency }
      });
    } else {
      // Timeline Event failure
      await supabaseAdmin.from('lead_timeline_events').insert({
        company_id: tenant_id,
        lead_id: lead_id,
        event_type: 'cvcrm_delivery_failed',
        metadata: { status_code: response.status, error: result }
      });

      // Handle Retries or DLQ
      const isRetryable = response.status >= 500 || response.status === 429 || response.status === 408;
      if (isRetryable) {
          // Exponential backoff: 30s, 2min, 8min, 30min, 2h (cap)
          const attempt = (logRecord?.attempt_count ?? 0) + 1;
          const delayMs = Math.min(30_000 * Math.pow(4, attempt - 1), 2 * 60 * 60 * 1000);
          await supabaseAdmin.from('cvcrm_delivery_logs')
            .update({ status: 'retrying', next_retry_at: new Date(Date.now() + delayMs).toISOString() })
            .eq('id', logRecord.id);
      } else {
          // Move to DLQ (non-retryable: 4xx client errors)
          await supabaseAdmin.from('cvcrm_delivery_logs')
            .update({ status: 'dead_letter' })
            .eq('id', logRecord.id);
          const failureReason = `Non-retryable API error (HTTP ${response.status})`;
          const lastError = JSON.stringify(result);

          if (source_dlq_id) {
            await supabaseAdmin.from('cvcrm_dead_letter_queue')
              .update({
                trace_id: traceId,
                delivery_log_id: logRecord.id,
                failure_reason: failureReason,
                payload: cvPayload,
                last_error: lastError,
                resolved_at: null
              })
              .eq('id', source_dlq_id)
              .eq('company_id', tenant_id);
          } else {
            await supabaseAdmin.from('cvcrm_dead_letter_queue').insert({
              company_id: tenant_id,
              lead_id: lead_id,
              trace_id: traceId,
              delivery_log_id: logRecord.id,
              failure_reason: failureReason,
              payload: cvPayload,
              last_error: lastError
            });
          }
      }
    }

    return new Response(JSON.stringify({ 
      success: response.ok, 
      cvcrm_lead_id: result.id_lead || result.id || null,
      trace_id: traceId 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error(`[send-cvcrm-lead] [${traceId}] Error: `, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message, trace_id: traceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
