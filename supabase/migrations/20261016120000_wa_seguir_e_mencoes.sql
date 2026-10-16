-- ===========================================================================
-- WhatsApp: seguir conversa e menções em notas internas
-- ===========================================================================
-- Duas tabelas pequenas, ambas PESSOAIS: cada pessoa só enxerga as próprias
-- linhas. Escrita só pelo servidor (service_role), depois de conferir papel e
-- empresa — o mesmo desenho de `wa_notes`.
--
--   wa_conversation_followers  quem segue qual conversa ("Seguindo")
--   wa_mentions                "fulano te mencionou numa nota" (não lida/lida)

CREATE TABLE IF NOT EXISTS public.wa_conversation_followers (
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS wa_followers_user_idx
  ON public.wa_conversation_followers (user_id, company_id);

CREATE TABLE IF NOT EXISTS public.wa_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.wa_notes(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (note_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS wa_mentions_user_idx
  ON public.wa_mentions (mentioned_user_id, company_id) WHERE read_at IS NULL;

ALTER TABLE public.wa_conversation_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_followers_leitura ON public.wa_conversation_followers;
CREATE POLICY wa_followers_leitura ON public.wa_conversation_followers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.check_membership(company_id));

DROP POLICY IF EXISTS wa_mentions_leitura ON public.wa_mentions;
CREATE POLICY wa_mentions_leitura ON public.wa_mentions
  FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid() AND public.check_membership(company_id));

REVOKE ALL ON public.wa_conversation_followers, public.wa_mentions FROM authenticated, anon;
GRANT SELECT ON public.wa_conversation_followers, public.wa_mentions TO authenticated;
GRANT ALL ON public.wa_conversation_followers, public.wa_mentions TO service_role;
