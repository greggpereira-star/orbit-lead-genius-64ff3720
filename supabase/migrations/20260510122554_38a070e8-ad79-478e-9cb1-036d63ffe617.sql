-- Drop the tables created in the failed/messy previous step to recreate them cleanly
DROP TABLE IF EXISTS public.form_partial_submissions CASCADE;
DROP TABLE IF EXISTS public.form_scoring_rules CASCADE;
DROP TABLE IF EXISTS public.form_temperature_rules CASCADE;
DROP TABLE IF EXISTS public.form_submissions CASCADE;
DROP TABLE IF EXISTS public.lead_scores CASCADE;
DROP TABLE IF EXISTS public.lead_tags CASCADE;

-- Recreate tables with absolute certainty on column names
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
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days')
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

CREATE TABLE public.lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    change_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.lead_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(lead_id, tag_name)
);

-- RLS
ALTER TABLE public.form_partial_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_temperature_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert partial submissions" ON public.form_partial_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update partial submissions" ON public.form_partial_submissions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public select partial submissions" ON public.form_partial_submissions FOR SELECT USING (true);

CREATE POLICY "Allow public insert submissions" ON public.form_submissions FOR INSERT WITH CHECK (true);

-- Membership-based policies
CREATE POLICY "Tenant isolation for scoring rules" ON public.form_scoring_rules
    FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Tenant isolation for temperature rules" ON public.form_temperature_rules
    FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Tenant isolation for submissions" ON public.form_submissions
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Tenant isolation for lead scores" ON public.lead_scores
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.leads 
        WHERE leads.id = lead_scores.lead_id 
        AND leads.company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

CREATE POLICY "Tenant isolation for lead tags" ON public.lead_tags
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.leads 
        WHERE leads.id = lead_tags.lead_id 
        AND leads.company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));
