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
        'Authorization': `Bearer ${connection.access_token}`,
        'developer-token': devToken || ""
      }
    })
    
    const adAccData = await adAccRes.json()

    // 2. Fetch Google Ads Customers (Enterprise Discovery)
    const customersRes = await fetch("https://googleads.googleapis.com/v15/customers:listAccessibleCustomers", {
      headers: {
        'Authorization': `Bearer ${connection.access_token}`,
        'developer-token': devToken || ""
      }
    })
    
    const customersData = await customersRes.json()

    if (customersData.resourceNames) {
      for (const resName of customersData.resourceNames) {
        const customerId = resName.split('/')[1]
        
        // Fetch detail for each customer
        const detailRes = await fetch(`https://googleads.googleapis.com/v15/${resName}`, {
           headers: {
             'Authorization': `Bearer ${connection.access_token}`,
             'developer-token': devToken || ""
           }
        })
        const detail = await detailRes.json()

        await supabaseAdmin.from('google_assets').upsert({
          company_id: companyId,
          asset_type: 'ad_account',
          external_id: customerId,
          name: detail.descriptiveName || `Ad Account ${customerId}`,
          metadata: { 
            resourceName: resName, 
            currencyCode: detail.currencyCode,
            timeZone: detail.timeZone,
            is_mcc: detail.manager
          }
        }, { onConflict: 'company_id,asset_type,external_id' })

        // 3. Discover Conversion Actions for each account
        // Enterprise Requirement: GCLID Uploads need Conversion Actions
        const query = "SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status FROM conversion_action"
        const convRes = await fetch(`https://googleads.googleapis.com/v15/customers/${customerId}/googleAds:search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'developer-token': devToken || "",
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query })
        })
        const convData = await convRes.json()
        if (convData.results) {
          for (const row of convData.results) {
            await supabaseAdmin.from('google_assets').upsert({
              company_id: companyId,
              asset_type: 'conversion_action',
              external_id: row.conversionAction.id,
              name: row.conversionAction.name,
              metadata: { 
                account_id: customerId,
                type: row.conversionAction.type,
                status: row.conversionAction.status
              }
            }, { onConflict: 'company_id,asset_type,external_id' })
          }
        }
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
