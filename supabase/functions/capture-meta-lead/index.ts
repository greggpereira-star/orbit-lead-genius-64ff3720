import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const { leadId, pageId, formId } = await req.json()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Find the company associated with this page
    const { data: asset } = await supabaseAdmin
      .from('meta_assets')
      .select('company_id')
      .eq('external_id', pageId)
      .eq('asset_type', 'page')
      .single()

    if (!asset) throw new Error("Company not found for page: " + pageId)

    // 2. Get tokens for this company
    const { data: connection } = await supabaseAdmin
      .from('oauth_connections')
      .select('*')
      .eq('company_id', asset.company_id)
      .eq('provider', 'meta')
      .single()

    if (!connection) throw new Error("Meta connection missing")

    // 3. Fetch lead details from Meta Graph API
    const leadRes = await fetch("https://graph.facebook.com/v18.0/" + leadId + "?access_token=" + connection.access_token)
    const leadData = await leadRes.json()

    // 4. Transform and Save
    const fieldData: any = {}
    leadData.field_data?.forEach((f: any) => {
      fieldData[f.name] = f.values[0]
    })

    const { data: newLead } = await supabaseAdmin.from('leads').insert({
      company_id: asset.company_id,
      name: fieldData.full_name || fieldData.first_name + " " + fieldData.last_name,
      email: fieldData.email,
      phone: fieldData.phone_number,
      source: 'Meta Lead Ads',
      utm_source: 'facebook',
      utm_medium: 'paid',
      metadata: { 
        meta_lead_id: leadId, 
        meta_form_id: formId, 
        meta_page_id: pageId,
        raw_data: leadData 
      }
    }).select().single()

    // 5. Trigger delivery to CV.CRM if configured
    if (newLead) {
       await supabaseAdmin.functions.invoke('sync-cvcrm', {
         body: { leadId: newLead.id, companyId: asset.company_id }
       })
    }

    return new Response(JSON.stringify({ success: true }))

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
