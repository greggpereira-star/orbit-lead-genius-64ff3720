
ALTER TABLE public.whatsapp_click_events
  ADD COLUMN IF NOT EXISTS event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS capi_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS capi_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capi_last_error text,
  ADD COLUMN IF NOT EXISTS capi_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS capi_response jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_click_events_event_id_key ON public.whatsapp_click_events(event_id);
CREATE INDEX IF NOT EXISTS idx_wa_capi_status_pending ON public.whatsapp_click_events(company_id, capi_status, created_at)
  WHERE capi_status IN ('pending','retry');

CREATE TABLE IF NOT EXISTS public.whatsapp_capi_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  click_event_id uuid REFERENCES public.whatsapp_click_events(id) ON DELETE SET NULL,
  event_id uuid,
  trace_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.whatsapp_capi_dlq TO authenticated;
GRANT ALL ON public.whatsapp_capi_dlq TO service_role;
ALTER TABLE public.whatsapp_capi_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read wa capi dlq" ON public.whatsapp_capi_dlq;
CREATE POLICY "members read wa capi dlq" ON public.whatsapp_capi_dlq
  FOR SELECT TO authenticated USING (check_membership(company_id));

DROP POLICY IF EXISTS "members update wa capi dlq" ON public.whatsapp_capi_dlq;
CREATE POLICY "members update wa capi dlq" ON public.whatsapp_capi_dlq
  FOR UPDATE TO authenticated USING (check_membership(company_id)) WITH CHECK (check_membership(company_id));

CREATE INDEX IF NOT EXISTS idx_wa_capi_dlq_company_unresolved
  ON public.whatsapp_capi_dlq(company_id, resolved_at, created_at DESC);
