-- Add new form types
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'form_type') THEN
        CREATE TYPE form_type AS ENUM ('standard', 'multi_step', 'quiz', 'conversational');
    END IF;
END $$;

-- Add step_id to form_fields if it doesn't exist
ALTER TABLE public.form_fields ADD COLUMN IF NOT EXISTS step_id UUID;

-- Create form_steps table
CREATE TABLE IF NOT EXISTS public.form_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    button_text TEXT DEFAULT 'Avançar',
    conditional_logic JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for form_steps
ALTER TABLE public.form_steps ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for form_steps
CREATE POLICY "Users can view form steps for their forms" ON public.form_steps
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.forms 
        WHERE forms.id = form_steps.form_id 
        AND forms.tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

CREATE POLICY "Users can insert form steps for their forms" ON public.form_steps
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.forms 
        WHERE forms.id = form_steps.form_id 
        AND forms.tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

CREATE POLICY "Users can update form steps for their forms" ON public.form_steps
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.forms 
        WHERE forms.id = form_steps.form_id 
        AND forms.tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

CREATE POLICY "Users can delete form steps for their forms" ON public.form_steps
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.forms 
        WHERE forms.id = form_steps.form_id 
        AND forms.tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

-- Create scoring rules table
CREATE TABLE IF NOT EXISTS public.form_scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    field_id UUID REFERENCES public.form_fields(id) ON DELETE CASCADE,
    condition_value TEXT NOT NULL,
    score_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for form_scoring_rules
ALTER TABLE public.form_scoring_rules ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for form_scoring_rules
CREATE POLICY "Users can manage scoring rules for their forms" ON public.form_scoring_rules
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.forms 
        WHERE forms.id = form_scoring_rules.form_id 
        AND forms.tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())
    ));

-- Update forms table with missing columns if any
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS type_v2 TEXT DEFAULT 'standard';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_temperature TEXT;
