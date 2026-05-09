-- Hardening security on handle_new_user
ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Create companies first
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create memberships second (depends on companies)
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Policies for companies
CREATE POLICY "Users can view their own companies" 
ON public.companies FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.memberships 
  WHERE memberships.company_id = companies.id 
  AND memberships.user_id = auth.uid()
));

CREATE POLICY "Users can insert companies during onboarding" 
ON public.companies FOR INSERT 
WITH CHECK (true);

-- Policies for memberships
CREATE POLICY "Users can view their own memberships" 
ON public.memberships FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert memberships during onboarding" 
ON public.memberships FOR INSERT 
WITH CHECK (auth.uid() = user_id);
