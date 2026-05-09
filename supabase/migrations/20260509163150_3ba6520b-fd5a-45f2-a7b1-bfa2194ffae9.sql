-- 1. Remover trigger frágil se existir (vamos mover a lógica para o orchestrator no código)
DROP TRIGGER IF EXISTS on_auth_user_created_company ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_company();

-- 2. Hardening Schema Companies
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_key') THEN
        ALTER TABLE public.companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);

-- 3. Hardening Schema Memberships
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_company_id ON public.memberships(company_id);

-- 4. RLS Hardening - Companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies" 
ON public.companies FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.company_id = companies.id 
    AND memberships.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create companies during onboarding" ON public.companies;
CREATE POLICY "Users can create companies during onboarding" 
ON public.companies FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- 5. RLS Hardening - Memberships
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own memberships" ON public.memberships;
CREATE POLICY "Users can view their own memberships" 
ON public.memberships FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own membership" ON public.memberships;
CREATE POLICY "Users can create their own membership" 
ON public.memberships FOR INSERT 
WITH CHECK (auth.uid() = user_id);
