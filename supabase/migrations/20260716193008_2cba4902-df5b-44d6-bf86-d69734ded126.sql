
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.chat_create_lead_from_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(NEW.visitor_name, NEW.visitor_email, 'Visitante ' || substring(NEW.visitor_id from 1 for 8));

  INSERT INTO public.leads (
    company_id, name, email, phone, source, status,
    score, temperature, landing_page, metadata
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
    jsonb_build_object(
      'visitor_id', NEW.visitor_id,
      'conversation_id', NEW.id,
      'origin', 'live_chat'
    )
  ) RETURNING id INTO v_lead_id;

  NEW.lead_id := v_lead_id;

  INSERT INTO public.lead_events (lead_id, event_type, description, metadata)
  VALUES (
    v_lead_id,
    'chat_started',
    'Lead iniciou conversa via chat ao vivo.',
    jsonb_build_object('conversation_id', NEW.id, 'page_url', NEW.page_url)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_conv_create_lead ON public.chat_conversations;
CREATE TRIGGER chat_conv_create_lead
  BEFORE INSERT ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_create_lead_from_conversation();
