import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { leadId, companyId } = await req.json()

    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Fetch Lead Data
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) throw new Error('Lead not found')

    // 3. Fetch Company Integration Config
    const { data: integration, error: intError } = await supabaseAdmin
      .from('integrations')
      .select('config')
      .eq('company_id', companyId)
      .eq('provider', 'cvcrm')
      .eq('status', 'connected')
      .single()

    if (intError || !integration) throw new Error('CV.CRM integration not configured')

    const { api_token, email, domain } = integration.config

    // 4. Prepare Payload according to CV.CRM official spec
    const cvPayload = {
      nome: lead.name,
      email: lead.email,
      telefone: lead.phone,
      id_empreendimento: lead.metadata?.id_empreendimento || lead.metadata?.product_id,
      origem: lead.utm_source || lead.metadata?.source || 'Lovable_CRM',
      // Fields requested by some versions of CV.CRM
      email_corretor: lead.metadata?.corretor_email,
      id_situacao: lead.metadata?.id_situacao || 1, // Default initial status
    }

    console.log(`Sending lead ${leadId} to CV.CRM domain: ${domain}`)

    // 5. Call CV.CRM API
    const response = await fetch(`https://${domain}.cvcrm.com.br/api/cv/lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': api_token,
        'email': email
      },
      body: JSON.stringify(cvPayload)
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(`CV.CRM API Error: ${JSON.stringify(result)}`)
    }

    // 6. Log success and update lead
    await supabaseAdmin.from('lead_events').insert({
      lead_id: leadId,
      event_type: 'integration_sync',
      description: 'Lead synced successfully to CV.CRM via Edge Function',
      metadata: { provider: 'cvcrm', external_response: result }
    })

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
