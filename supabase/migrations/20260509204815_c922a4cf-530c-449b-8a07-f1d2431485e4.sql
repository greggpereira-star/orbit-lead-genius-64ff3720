-- Create stages table if missing (just in case, though app uses it)
CREATE TABLE IF NOT EXISTS public.stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on stages
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

-- Stages Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their company stages') THEN
        CREATE POLICY "Users can view their company stages" ON public.stages
            FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = stages.company_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage company stages') THEN
        CREATE POLICY "Admins can manage company stages" ON public.stages
            FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = stages.company_id AND role IN ('admin', 'owner')));
    END IF;
END $$;

-- Fix leads INSERT policy (the previous one had a typo memberships.company_id = memberships.company_id)
DROP POLICY IF EXISTS "Users can create company leads" ON public.leads;
CREATE POLICY "Users can create company leads" ON public.leads
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = leads.company_id));

-- Profiles visibility within tenant (to avoid null profiles when looking at leads/audit logs)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view profiles of tenant members') THEN
        CREATE POLICY "Users can view profiles of tenant members" ON public.profiles
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM memberships m1
                    JOIN memberships m2 ON m1.company_id = m2.company_id
                    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
                )
            );
    END IF;
END $$;

-- Ensure companies can be updated by owners
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners can update their companies') THEN
        CREATE POLICY "Owners can update their companies" ON public.companies
            FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = companies.id AND role = 'owner'));
    END IF;
END $$;
