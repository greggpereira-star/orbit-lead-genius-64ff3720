
-- 1. Tracking nas conversas
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS referrer text;

-- 2. Eventos de clique no WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  visitor_id text,
  session_id text,
  phone_destination text,
  message text,
  final_url text,
  page_url text,
  referrer text,
  user_agent text,
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.whatsapp_click_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_click_events TO authenticated;
GRANT ALL ON public.whatsapp_click_events TO service_role;

ALTER TABLE public.whatsapp_click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert whatsapp clicks"
  ON public.whatsapp_click_events FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "members can read whatsapp clicks"
  ON public.whatsapp_click_events FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE INDEX IF NOT EXISTS idx_wa_click_company_created
  ON public.whatsapp_click_events (company_id, created_at DESC);

-- 3. Trigger de criação de lead a partir de conversa: copiar UTMs e tracking
CREATE OR REPLACE FUNCTION public.chat_create_lead_from_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_name text;
  v_t jsonb := COALESCE(NEW.tracking, '{}'::jsonb);
BEGIN
  v_name := COALESCE(NEW.visitor_name, NEW.visitor_email, 'Visitante ' || substring(NEW.visitor_id from 1 for 8));

  INSERT INTO public.leads (
    company_id, name, email, phone, source, status,
    score, temperature, landing_page, referrer,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, metadata
  ) VALUES (
    NEW.company_id,
    v_name,
    NEW.visitor_email,
    NEW.visitor_phone,
    'chat_widget',
    'new',
    0,
    'warm',
    NEW.page_url,
    NEW.referrer,
    v_t->>'utm_source',
    v_t->>'utm_medium',
    v_t->>'utm_campaign',
    v_t->>'utm_content',
    v_t->>'utm_term',
    v_t->>'gclid',
    v_t->>'fbclid',
    jsonb_build_object(
      'visitor_id', NEW.visitor_id,
      'conversation_id', NEW.id,
      'origin', 'live_chat',
      'fbp', v_t->>'fbp',
      'fbc', v_t->>'fbc',
      'gbraid', v_t->>'gbraid',
      'wbraid', v_t->>'wbraid'
    )
  ) RETURNING id INTO v_lead_id;

  NEW.lead_id := v_lead_id;

  INSERT INTO public.lead_events (lead_id, event_type, description, metadata)
  VALUES (
    v_lead_id,
    'chat_started',
    'Lead iniciou conversa via chat ao vivo.',
    jsonb_build_object('conversation_id', NEW.id, 'page_url', NEW.page_url, 'tracking', v_t)
  );

  RETURN NEW;
END;
$$;
