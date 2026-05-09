import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseAdmin, logAudit, enqueueJob } from "../_shared/enterprise.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

// Timing-safe comparison for signature validation
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = getSupabaseAdmin()
  const traceId = crypto.randomUUID()
  const ipAddress = req.headers.get('x-forwarded-for') || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'

  // 1. Meta Challenge Verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const expectedToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')

    if (mode === 'subscribe' && token === expectedToken) {
      await logAudit(supabaseAdmin, {
        provider: 'meta',
        event_type: 'webhook_verification',
        status: 'success',
        trace_id: traceId,
        ip_address: ipAddress
      })
      return new Response(challenge)
    }

    await logAudit(supabaseAdmin, {
      provider: 'meta',
      event_type: 'webhook_verification_failed',
      status: 'error',
      error_message: `Invalid verify token: ${token}`,
      trace_id: traceId,
      ip_address: ipAddress
    })
    return new Response("Forbidden", { status: 403 })
  }

  // 2. Handle Notification (POST) with Signature Validation
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    
    // Enterprise signature validation
    if (signature) {
      const appSecret = Deno.env.get('META_APP_SECRET')
      if (appSecret) {
        const hmacKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(appSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        )
        const signatureBytes = await crypto.subtle.sign(
          "HMAC",
          hmacKey,
          new TextEncoder().encode(rawBody)
        )
        const expectedSignature = `sha256=${Array.from(new Uint8Array(signatureBytes))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')}`

        if (!timingSafeEqual(signature, expectedSignature)) {
          await logAudit(supabaseAdmin, {
            provider: 'meta',
            event_type: 'webhook_invalid_signature',
            status: 'error',
            payload: { signature, expectedSignature },
            trace_id: traceId,
            ip_address: ipAddress
          })
          return new Response("Invalid Signature", { status: 401 })
        }
      }
    }

    const body = JSON.parse(rawBody)
    console.log(`[${traceId}] Meta Webhook Event Received`)

    if (body.object === 'page') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const { leadgen_id, page_id, form_id } = change.value
            
            const { data: asset } = await supabaseAdmin
              .from('meta_assets')
              .select('company_id')
              .eq('external_id', page_id)
              .eq('asset_type', 'page')
              .limit(1)
              .maybeSingle()

            if (asset) {
              await enqueueJob(supabaseAdmin, {
                company_id: asset.company_id,
                queue_name: 'capture-meta-lead',
                payload: { leadId: leadgen_id, pageId: page_id, formId: form_id },
                trace_id: traceId
              })

              await logAudit(supabaseAdmin, {
                company_id: asset.company_id,
                provider: 'meta',
                event_type: 'lead_webhook_enqueued',
                status: 'success',
                payload: { leadgen_id, page_id, form_id },
                trace_id: traceId
              })
            } else {
              await logAudit(supabaseAdmin, {
                provider: 'meta',
                event_type: 'orphan_webhook_event',
                status: 'warning',
                error_message: `No company found for page ${page_id}`,
                payload: { page_id, leadgen_id },
                trace_id: traceId
              })
            }
          }
        }
      }
    }

    return new Response("ok", { headers: corsHeaders })
  } catch (error) {
    console.error(`[${traceId}] Webhook Error:`, error.message)
    await logAudit(supabaseAdmin, {
      provider: 'meta',
      event_type: 'webhook_error',
      status: 'error',
      error_message: error.message,
      trace_id: traceId
    })
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
