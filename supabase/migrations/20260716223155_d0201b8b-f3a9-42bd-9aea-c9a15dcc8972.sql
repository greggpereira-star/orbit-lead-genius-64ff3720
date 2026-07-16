
-- Chat departments (setores)
CREATE TABLE IF NOT EXISTS public.chat_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_departments_company ON public.chat_departments(company_id);

-- Chat operators (atendentes)
CREATE TABLE IF NOT EXISTS public.chat_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  department_id UUID REFERENCES public.chat_departments(id) ON DELETE SET NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent','supervisor','admin')),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','away','busy','offline')),
  max_concurrent INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_operators_company ON public.chat_operators(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_operators_user ON public.chat_operators(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_departments TO authenticated;
GRANT ALL ON public.chat_departments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_operators TO authenticated;
GRANT ALL ON public.chat_operators TO service_role;

ALTER TABLE public.chat_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_operators ENABLE ROW LEVEL SECURITY;

-- RLS: any member of the company can read; only owner/admin can write
CREATE POLICY "chat_departments_read_by_members" ON public.chat_departments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_departments.company_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "chat_departments_write_by_admins" ON public.chat_departments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_departments.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_departments.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  ));

CREATE POLICY "chat_operators_read_by_members" ON public.chat_operators
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_operators.company_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "chat_operators_self_update_status" ON public.chat_operators
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_operators_write_by_admins" ON public.chat_operators
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_operators.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.company_id = chat_operators.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  ));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.chat_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_chat_departments_updated ON public.chat_departments;
CREATE TRIGGER trg_chat_departments_updated BEFORE UPDATE ON public.chat_departments
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_updated_at();

DROP TRIGGER IF EXISTS trg_chat_operators_updated ON public.chat_operators;
CREATE TRIGGER trg_chat_operators_updated BEFORE UPDATE ON public.chat_operators
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_updated_at();

-- Add department + assignment routing to chat_conversations
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.chat_departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_department ON public.chat_conversations(department_id);
