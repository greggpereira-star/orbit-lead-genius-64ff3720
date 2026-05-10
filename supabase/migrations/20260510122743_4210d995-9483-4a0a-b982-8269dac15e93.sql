-- Drop tables with potentially wrong column names
DROP TABLE IF EXISTS public.form_partial_submissions CASCADE;
DROP TABLE IF EXISTS public.form_scoring_rules CASCADE;
DROP TABLE IF EXISTS public.form_temperature_rules CASCADE;
DROP TABLE IF EXISTS public.form_submissions CASCADE;
DROP TABLE IF EXISTS public.form_tag_rules CASCADE;

-- Standardize forms table (ensure company_id exists)
-- If tenant_id exists, rename it. If not, do nothing.
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forms' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.forms RENAME COLUMN tenant_id TO company_id;
    END IF;
END $$;

-- Create enterprise tables using company_id
CREATE TABLE public.form_partial_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    form_slug TEXT NOT NULL,
    session_id TEXT NOT NULL,
    visitor_id TEXT,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    current_step_id UUID,
    current_step_index INTEGER DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb,
    tracking JSONB DEFAULT '{}'::jsonb,
    score_preview INTEGER DEFAULT 0,
    temperature_preview TEXT,
    status TEXT NOT NULL DEFAULT 'started',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days'),
    UNIQUE(session_id, form_id)
);

CREATE TABLE public.form_scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    step_id UUID,
    field_id UUID REFERENCES public.form_fields(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    condition JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_delta INTEGER NOT NULL DEFAULT 0,
    tag_to_apply TEXT,
    temperature_override TEXT,
    recommended_action TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.form_temperature_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    color TEXT,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.form_tag_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    condition JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    score INTEGER DEFAULT 0,
    temperature TEXT,
    tags TEXT[],
    tracking JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Lead scoring columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'cold';

-- RLS
ALTER TABLE public.form_partial_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_temperature_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_tag_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public partial submissions" ON public.form_partial_submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public submissions insert" ON public.form_submissions FOR INSERT WITH CHECK (true);

-- Membership-based isolation
CREATE POLICY "Company isolation scoring" ON public.form_scoring_rules
    FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Company isolation temp" ON public.form_temperature_rules
    FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Company isolation tags" ON public.form_tag_rules
    FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Company isolation submissions" ON public.form_submissions
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));
