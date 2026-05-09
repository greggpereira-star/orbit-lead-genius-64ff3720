import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const validateLead = (lead: any) => {
  const errors = [];
  if (!lead.name) errors.push('Name is required');
  if (!lead.email && !lead.phone) errors.push('Email or Phone is required');
  return { isValid: errors.length === 0, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { leadId, companyId } = await req.json()
    const startTime = Date.now()

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) throw new Error('Lead not found')

    const validation = validateLead(lead);
    if (!validation.isValid) throw new Error("Validation failed: " + validation.errors.join(', '));

    const { data: integration, error: intError } = await supabaseAdmin
      .from('cvcrm_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single()

    if (intError || !integration) throw new Error('CV.CRM integration not configured or inactive')

    const cvPayload = {
      nome: lead.name,
      email: lead.email,
      telefone: lead.phone,
      id_empreendimento: lead.metadata?.id_empreendimento || lead.metadata?.product_id,
      origem: lead.utm_source || lead.metadata?.source || 'LeadFlow',
      
      // LeadFlow Enrichment Mapping
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_content: lead.utm_content,
      utm_term: lead.utm_term,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
      
      // Custom Fields Mapping (LeadFlow -> CV.CRM Custom Fields)
      campo_personalizado_utm_source: lead.utm_source,
      campo_personalizado_utm_campaign: lead.utm_campaign,
      campo_personalizado_gclid: lead.gclid,
      campo_personalizado_lead_score: lead.lead_score,
      campo_personalizado_temperature: lead.lead_temperature,
      
      id_situacao: lead.metadata?.id_situacao || 1,
    }

    const apiUrl = "https://" + integration.cvcrm_base_url + ".cvcrm.com.br/api/cv/lead";

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': integration.api_token,
        'email': integration.api_user
      },
      body: JSON.stringify(cvPayload)
    })

    const result = await response.json();
    const latency = Date.now() - startTime;

    await supabaseAdmin.from('cvcrm_sync_logs').insert({
      company_id: companyId,
      lead_id: leadId,
      direction: 'outbound',
      payload_sent: cvPayload,
      payload_received: result,
      status_code: response.status,
      request_id: crypto.randomUUID(),
      latency_ms: latency,
      error_message: response.ok ? null : JSON.stringify(result)
    })

    if (!response.ok) throw new Error("CV.CRM API Error: " + JSON.stringify(result));

    await supabaseAdmin
      .from('leads')
      .update({
        cvcrm_id: result.id_lead || result.id,
        sync_status: 'synced',
        last_sync_at: new Date().toISOString()
      })
      .eq('id', leadId)

    await supabaseAdmin
      .from('cvcrm_sync_queue')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('entity_id', leadId)
      .eq('status', 'pending')

    return new Response(JSON.stringify({ success: true, data: result }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
