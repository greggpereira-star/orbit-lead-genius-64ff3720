import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')

  if (!code || !stateParam) {
    return new Response("Missing code or state", { status: 400 })
  }

  try {
    const { companyId, provider, origin } = JSON.parse(atob(stateParam))
    
    let tokenUrl = ""
    let body = new URLSearchParams()
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`

    if (provider === 'meta') {
      tokenUrl = "https://graph.facebook.com/v18.0/oauth/access_token"
      body.append('client_id', Deno.env.get('META_APP_ID') || "")
      body.append('client_secret', Deno.env.get('META_APP_SECRET') || "")
      body.append('redirect_uri', redirectUri)
      body.append('code', code)
    } else if (provider === 'google') {
      tokenUrl = "https://oauth2.googleapis.com/token"
      body.append('client_id', Deno.env.get('GOOGLE_CLIENT_ID') || "")
      body.append('client_secret', Deno.env.get('GOOGLE_CLIENT_SECRET') || "")
      body.append('redirect_uri', redirectUri)
      body.append('code', code)
      body.append('grant_type', 'authorization_code')
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: body
    })

    const tokenData = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(tokenData))

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Store tokens
    const { error: upsertError } = await supabaseAdmin
      .from('oauth_connections')
      .upsert({
        company_id: companyId,
        provider,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        status: 'active',
        updated_at: new Date().toISOString()
      })

    if (upsertError) throw upsertError

    // Redirect back to the app
    return Response.redirect(`${origin}/settings/integrations?provider=${provider}&status=success`, 302)

  } catch (error) {
    console.error("OAuth Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
