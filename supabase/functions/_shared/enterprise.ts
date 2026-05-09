import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const getSupabaseAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

export const logAudit = async (supabase: any, data: {
  company_id?: string,
  provider: string,
  event_type: string,
  status: string,
  payload?: any,
  error_message?: string,
  trace_id?: string,
  ip_address?: string,
  user_agent?: string
}) => {
  await supabase.from('integration_audit_logs').insert(data)
}

export const enqueueJob = async (supabase: any, data: {
  company_id: string,
  queue_name: string,
  payload: any,
  max_retries?: number,
  trace_id?: string
}) => {
  const { data: job, error } = await supabase.from('integration_jobs').insert({
    company_id: data.company_id,
    queue_name: data.queue_name,
    payload: data.payload,
    max_retries: data.max_retries ?? 5,
    trace_id: data.trace_id,
    status: 'pending'
  }).select().single()
  
  if (error) console.error("Error enqueuing job:", error)
  return job
}
