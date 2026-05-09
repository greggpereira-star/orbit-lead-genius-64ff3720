import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { companyId } = await req.json()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get tokens
    const { data: connection, error: connError } = await supabaseAdmin
      .from('oauth_connections')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) throw new Error("Google connection not found")

    // 2. Fetch Google Ads Accounts
    // Note: This requires the Google Ads API developer token which should be in env
    const devToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
    
    // For now, let's mock the discovery if dev token is missing, or use a basic profile fetch
    // Real implementation would call: https://googleads.googleapis.com/v15/customers:listAccessibleCustomers
    
    const adAccRes = await fetch("https://googleads.googleapis.com/v15/customers:listAccessibleCustomers", {
      headers: {
        'Authorization': \`Bearer \${connection.access_token}\`,
        'developer-token': devToken || ""
      }
    })
    
    const adAccData = await adAccRes.json()

    if (adAccData.resourceNames) {
      for (const resName of adAccData.resourceNames) {
        const customerId = resName.split('/')[1]
        await supabaseAdmin.from('google_assets').upsert({
          company_id: companyId,
          asset_type: 'ad_account',
          external_id: customerId,
          name: \`Ad Account \${customerId}\`,
          metadata: { resourceName: resName }
        }, { onConflict: 'company_id,asset_type,external_id' })
      }
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
