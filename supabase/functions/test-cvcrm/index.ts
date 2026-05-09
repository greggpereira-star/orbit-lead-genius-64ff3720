import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { companyId } = await req.json()

    // 1. Fetch Config
    const { data: config, error: configError } = await supabaseAdmin
      .from('cvcrm_integrations')
      .select('*')
      .eq('company_id', companyId)
      .single()

    if (configError || !config) throw new Error('Integration not found')

    // 2. Test Connection
    const apiUrl = \`https://\${config.cvcrm_base_url}.cvcrm.com.br/api/cv/situacao\`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'token': config.api_token,
        'email': config.api_user
      }
    })

    if (!response.ok) {
      let friendlyError = 'Invalid credentials or subdomain';
      if (response.status === 401) friendlyError = 'Invalid API Token or User';
      if (response.status === 404) friendlyError = 'Subdomain not found';
      
      throw new Error(friendlyError);
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
