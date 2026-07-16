CREATE TABLE public.chat_quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.chat_departments(id) ON DELETE SET NULL,
  shortcut TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_quick_replies_company ON public.chat_quick_replies(company_id);
CREATE INDEX idx_chat_quick_replies_dept ON public.chat_quick_replies(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_quick_replies TO authenticated;
GRANT ALL ON public.chat_quick_replies TO service_role;

ALTER TABLE public.chat_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view quick replies"
  ON public.chat_quick_replies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = chat_quick_replies.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage quick replies"
  ON public.chat_quick_replies FOR ALL
  TO authenticated
  USING (
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
  WITH CHECK (
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
  );

CREATE TRIGGER update_chat_quick_replies_updated_at
  BEFORE UPDATE ON public.chat_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();