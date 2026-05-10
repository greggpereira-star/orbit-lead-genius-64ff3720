-- 1. Performance Indexes for Enterprise Scale
CREATE INDEX IF NOT EXISTS idx_forms_tenant_id_status ON public.forms(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_forms_slug ON public.forms(slug);
CREATE INDEX IF NOT EXISTS idx_leads_company_id_created_at ON public.leads(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_user_company ON public.memberships(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id_sort ON public.form_fields(form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cvcrm_delivery_logs_idempotency ON public.cvcrm_delivery_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_system_logs_company_id ON public.system_logs(company_id);

-- 2. Infrastructure: Lead Events (Required by Capture Service)
CREATE TABLE IF NOT EXISTS public.lead_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view events of their company leads" ON public.lead_events
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.leads l
        JOIN public.memberships m ON m.company_id = l.company_id
        WHERE l.id = lead_events.lead_id AND m.user_id = auth.uid()
    ));

-- 3. Optimization: Atomic Form Update RPC (Performance & Reliability)
-- Already exists but reinforcing search_path and error isolation
ALTER FUNCTION public.update_form_with_fields(uuid, jsonb, jsonb) SET search_path TO public;

-- 4. Feature Readiness: Conversion Mapping
CREATE TABLE IF NOT EXISTS public.conversion_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
    platform TEXT NOT NULL, -- 'google', 'meta'
    external_event_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.conversion_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company conversion mappings" ON public.conversion_mapping
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.memberships WHERE company_id = conversion_mapping.company_id AND user_id = auth.uid()
    ));

-- 5. Telemetry: Error Tracking (System level)
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id),
    user_id UUID REFERENCES auth.users(id),
    trace_id TEXT,
    error_code TEXT,
    error_message TEXT,
    stack_trace TEXT,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own company error logs" ON public.error_logs
    FOR SELECT USING (company_id IS NULL OR EXISTS (
        SELECT 1 FROM public.memberships WHERE company_id = error_logs.company_id AND user_id = auth.uid()
    ));

-- 6. Trigger for updated_at tracking
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_conversion_mapping_updated_at
    BEFORE UPDATE ON public.conversion_mapping
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
