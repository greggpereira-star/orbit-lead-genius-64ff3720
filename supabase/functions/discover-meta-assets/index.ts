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
      .eq('provider', 'meta')
      .single()

    if (connError || !connection) throw new Error("Meta connection not found")

    // 2. Fetch Pages
    const pagesRes = await fetch(\`https://graph.facebook.com/v18.0/me/accounts?access_token=\${connection.access_token}\`)
    const pagesData = await pagesRes.json()
    
    if (pagesData.data) {
      for (const page of pagesData.data) {
        await supabaseAdmin.from('meta_assets').upsert({
          company_id: companyId,
          asset_type: 'page',
          external_id: page.id,
          name: page.name,
          metadata: { category: page.category, tasks: page.tasks }
        }, { onConflict: 'company_id,asset_type,external_id' })
      }
    }

    // 3. Fetch Ad Accounts
    const adAccRes = await fetch(\`https://graph.facebook.com/v18.0/me/adaccounts?fields=name,account_id,status&access_token=\${connection.access_token}\`)
    const adAccData = await adAccRes.json()

    if (adAccData.data) {
      for (const acc of adAccData.data) {
        await supabaseAdmin.from('meta_assets').upsert({
          company_id: companyId,
          asset_type: 'ad_account',
          external_id: acc.id,
          name: acc.name,
          metadata: { account_id: acc.account_id, status: acc.status }
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
