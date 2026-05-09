-- Enterprise Forms Schema

-- 1. Forms Table
CREATE TABLE public.forms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, published, archived
    type TEXT NOT NULL DEFAULT 'traditional', -- traditional, multi-step, quiz, conversational
    settings JSONB NOT NULL DEFAULT '{
        "submit_label": "Submit",
        "success_message": "Thank you! We will contact you soon.",
        "redirect_url": null,
        "whatsapp_number": null,
        "theme": "premium-light",
        "cv_crm_integration": false,
        "capture_utms": true
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, slug)
);

-- 2. Form Fields Table
CREATE TABLE public.form_fields (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- text, email, phone, select, radio, checkbox, textarea, date, upload, range, rating, lgpd, hidden
    required BOOLEAN DEFAULT false,
    placeholder TEXT,
    options JSONB, -- For select, radio, checkbox: [{"label": "Option 1", "value": "1"}]
    validation_rules JSONB, -- regex, min/max, etc.
    sort_order INTEGER NOT NULL DEFAULT 0,
    step_number INTEGER NOT NULL DEFAULT 1,
    logic_rules JSONB, -- Show/hide logic
    score_rules JSONB, -- Scoring logic for each answer
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Form Submissions Table
CREATE TABLE public.form_submissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    answers JSONB NOT NULL,
    tracking_data JSONB DEFAULT '{}'::jsonb, -- utm_source, utm_medium, etc.
    metadata JSONB DEFAULT '{}'::jsonb, -- browser, ip, session_id
    score_total INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Form Analytics Table
CREATE TABLE public.form_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- view, start, step_complete, submission
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Forms
CREATE POLICY "Users can manage forms of their company" 
ON public.forms 
FOR ALL 
USING (tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Forms are publicly viewable if published" 
ON public.forms 
FOR SELECT 
USING (status = 'published');

-- Form Fields
CREATE POLICY "Users can manage form fields of their company forms" 
ON public.form_fields 
FOR ALL 
USING (form_id IN (SELECT id FROM public.forms WHERE tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())));

CREATE POLICY "Form fields are publicly viewable if form is published" 
ON public.form_fields 
FOR SELECT 
USING (form_id IN (SELECT id FROM public.forms WHERE status = 'published'));

-- Submissions
CREATE POLICY "Users can view submissions of their company forms" 
ON public.form_submissions 
FOR SELECT 
USING (tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Public can insert submissions" 
ON public.form_submissions 
FOR INSERT 
WITH CHECK (form_id IN (SELECT id FROM public.forms WHERE status = 'published'));

-- Analytics
CREATE POLICY "Users can view analytics of their company forms" 
ON public.form_analytics 
FOR SELECT 
USING (tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Public can insert analytics events" 
ON public.form_analytics 
FOR INSERT 
WITH CHECK (form_id IN (SELECT id FROM public.forms WHERE status = 'published'));

-- Update updated_at triggers
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_form_fields_updated_at BEFORE UPDATE ON public.form_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_forms_tenant ON public.forms(tenant_id);
CREATE INDEX idx_form_fields_form ON public.form_fields(form_id);
CREATE INDEX idx_form_submissions_form ON public.form_submissions(form_id);
CREATE INDEX idx_form_submissions_tenant ON public.form_submissions(tenant_id);
CREATE INDEX idx_form_analytics_form ON public.form_analytics(form_id);
