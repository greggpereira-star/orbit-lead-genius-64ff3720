
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_comment TEXT,
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_rating ON public.chat_conversations(company_id, rating) WHERE rating IS NOT NULL;
