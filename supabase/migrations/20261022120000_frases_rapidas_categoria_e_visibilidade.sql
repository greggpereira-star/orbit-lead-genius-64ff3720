-- Frases rápidas: categoria e visibilidade (da empresa toda ou só de quem criou).
-- Aditiva: as frases existentes ficam como estão (sem categoria, visíveis à empresa).

ALTER TABLE public.chat_quick_replies
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'company';

ALTER TABLE public.chat_quick_replies
  DROP CONSTRAINT IF EXISTS chat_quick_replies_visibility_check;
ALTER TABLE public.chat_quick_replies
  ADD CONSTRAINT chat_quick_replies_visibility_check CHECK (visibility IN ('company', 'private'));
ALTER TABLE public.chat_quick_replies
  DROP CONSTRAINT IF EXISTS chat_quick_replies_category_len;
ALTER TABLE public.chat_quick_replies
  ADD CONSTRAINT chat_quick_replies_category_len CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 40);

CREATE INDEX IF NOT EXISTS idx_chat_quick_replies_owner ON public.chat_quick_replies(created_by);

-- Ver: frases da empresa, e as privadas só para quem criou (nem admin enxerga a privada de outro).
DROP POLICY IF EXISTS "Members can view quick replies" ON public.chat_quick_replies;
CREATE POLICY "Members can view quick replies"
  ON public.chat_quick_replies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = chat_quick_replies.company_id
        AND m.user_id = auth.uid()
    )
    AND (visibility = 'company' OR created_by = auth.uid())
  );

-- Gerenciar as da empresa: quem já podia (owner/admin, supervisor/admin). Não alcança privada alheia.
DROP POLICY IF EXISTS "Managers can manage quick replies" ON public.chat_quick_replies;
CREATE POLICY "Managers can manage quick replies"
  ON public.chat_quick_replies FOR ALL
  TO authenticated
  USING (
    (visibility = 'company' OR created_by = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.company_id = chat_quick_replies.company_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_operators o
        WHERE o.company_id = chat_quick_replies.company_id
          AND o.user_id = auth.uid()
          AND o.role IN ('supervisor', 'admin')
      )
    )
  )
  WITH CHECK (
    (visibility = 'company' OR created_by = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.company_id = chat_quick_replies.company_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_operators o
        WHERE o.company_id = chat_quick_replies.company_id
          AND o.user_id = auth.uid()
          AND o.role IN ('supervisor', 'admin')
      )
    )
  );

-- Qualquer membro cria e gerencia as SUAS frases privadas.
DROP POLICY IF EXISTS "Members manage own private quick replies" ON public.chat_quick_replies;
CREATE POLICY "Members manage own private quick replies"
  ON public.chat_quick_replies FOR ALL
  TO authenticated
  USING (
    visibility = 'private' AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = chat_quick_replies.company_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    visibility = 'private' AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = chat_quick_replies.company_id AND m.user_id = auth.uid()
    )
  );
