import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseAdmin, logAudit } from "../_shared/enterprise.ts"

serve(async (req) => {
  const supabaseAdmin = getSupabaseAdmin()
  const traceId = crypto.randomUUID()

  try {
    const { leadId, pageId, formId } = await req.json()
    
    // 1. Find the company
    const { data: asset } = await supabaseAdmin
      .from('meta_assets')
      .select('company_id')
      .eq('external_id', pageId)
      .eq('asset_type', 'page')
      .limit(1)
      .maybeSingle()

    if (!asset) throw new Error("Company not found for page: " + pageId)

    // 2. Get tokens
    const { data: connection } = await supabaseAdmin
      .from('oauth_connections')
      .select('*')
      .eq('company_id', asset.company_id)
      .eq('provider', 'meta')
      .limit(1)
      .maybeSingle()

    if (!connection) throw new Error("Meta connection missing for company " + asset.company_id)

    // 3. Fetch lead details from Meta Graph API
    const leadRes = await fetch(`https://graph.facebook.com/v18.0/${leadId}?access_token=${connection.access_token}`)
    const leadData = await leadRes.json()

    if (leadData.error) {
        throw new Error(`Meta API Error: ${leadData.error.message}`)
    }

    // 4. Transform and Save (Enhanced Normalization)
    const fieldData: any = {}
    leadData.field_data?.forEach((f: any) => {
      const name = f.name.toLowerCase().trim()
      fieldData[name] = f.values[0]
    })

    // Enhanced Conversions Normalization
    const email = fieldData.email?.toLowerCase().trim() || ""
    const phone = fieldData.phone_number?.replace(/\D/g, '') || ""
    const firstName = fieldData.first_name || fieldData.full_name?.split(' ')[0] || ""
    const lastName = fieldData.last_name || fieldData.full_name?.split(' ').slice(1).join(' ') || ""

    const { data: newLead, error: insertError } = await supabaseAdmin.from('leads').insert({
      company_id: asset.company_id,
      name: fieldData.full_name || `${firstName} ${lastName}`.trim(),
      email: email,
      phone: phone,
      source: 'Meta Lead Ads',
      utm_source: 'facebook',
      utm_medium: 'paid',
      metadata: { 
        meta_lead_id: leadId, 
        meta_form_id: formId, 
        meta_page_id: pageId,
        enhanced_data: {
            email,
            phone,
            firstName,
            lastName
        },
        raw_data: leadData 
      }
    }).select().single()

    if (insertError) throw insertError

    await logAudit(supabaseAdmin, {
      company_id: asset.company_id,
      provider: 'meta',
      event_type: 'lead_captured',
      status: 'success',
      payload: { lead_id: newLead.id, meta_lead_id: leadId },
      trace_id: traceId
    })

    // 5. Trigger delivery to CV.CRM (Enterprise spec)
    if (newLead) {
       await supabaseAdmin.functions.invoke('send-cvcrm-lead', {
         body: { lead_id: newLead.id, tenant_id: asset.company_id }
       })
    }

    return new Response(JSON.stringify({ success: true }))

  } catch (error) {
    console.error("Capture Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
