
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  assigned_to UUID,
  page_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_agent INTEGER NOT NULL DEFAULT 0,
  unread_visitor INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_conv_company_idx ON public.chat_conversations(company_id, last_message_at DESC);
CREATE INDEX chat_conv_visitor_idx ON public.chat_conversations(company_id, visitor_id);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('visitor','agent','system')),
  sender_id UUID,
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_msg_conv_idx ON public.chat_messages(conversation_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO anon;
GRANT ALL ON public.chat_conversations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO anon;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access conversations" ON public.chat_conversations
  FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "members access messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "anon create conversation" ON public.chat_conversations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon read conversation" ON public.chat_conversations
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon update conversation" ON public.chat_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon insert visitor message" ON public.chat_messages
  FOR INSERT TO anon
  WITH CHECK (sender_type = 'visitor');

CREATE POLICY "anon read messages" ON public.chat_messages
  FOR SELECT TO anon USING (true);

CREATE TRIGGER chat_conv_updated
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.chat_bump_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.chat_conversations
     SET last_message_at = NEW.created_at,
         unread_agent = CASE WHEN NEW.sender_type = 'visitor' THEN unread_agent + 1 ELSE unread_agent END,
         unread_visitor = CASE WHEN NEW.sender_type = 'agent' THEN unread_visitor + 1 ELSE unread_visitor END,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER chat_msg_bump
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_bump_conversation();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
