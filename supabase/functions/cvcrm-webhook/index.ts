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

    // 1. Handshake & Handlers
    const url = new URL(req.url)
    const companyId = url.searchParams.get('cid')
    if (!companyId) throw new Error('Company ID (cid) missing')

    const rawBody = await req.text()
    const payload = JSON.parse(rawBody)
    const headers = Object.fromEntries(req.headers.entries())

    // 2. Validation & Security (Signature Verification Placeholder)
    // Em prod: verificar HMAC SHA256 com webhook_secret da empresa
    const eventType = payload.event_type || 'lead.updated'
    const eventHash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody + companyId))
      .then(hash => Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''))

    const hashString = await eventHash

    // 3. Queue & Event Bus (Idempotency check)
    const { data: eventRecord, error: insertError } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        company_id: companyId,
        event_type: eventType,
        raw_payload: payload,
        headers: headers,
        event_hash: hashString,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ success: true, message: 'Event already processed' }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }
      throw insertError
    }

    // 4. Async Event Dispatching (Simulated via DB trigger or Background process)
    // Aqui dispararíamos o Automation Engine e o Sync Engine

    return new Response(JSON.stringify({ success: true, event_id: eventRecord.id }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
