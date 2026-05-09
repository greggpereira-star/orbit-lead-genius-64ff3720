-- Audit logs for enterprise integrations
CREATE TABLE IF NOT EXISTS public.integration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB,
    error_message TEXT,
    trace_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Dead Letter Queue (DLQ) & Job Tracking
CREATE TABLE IF NOT EXISTS public.integration_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    queue_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, dlq
    retries INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,
    trace_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON public.integration_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_company ON public.integration_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_trace ON public.integration_audit_logs(trace_id);

-- Enable RLS
ALTER TABLE public.integration_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view audit logs for their company" ON public.integration_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.user_id = auth.uid()
            AND memberships.company_id = integration_audit_logs.company_id
        )
    );

CREATE POLICY "Users can manage jobs for their company" ON public.integration_jobs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.user_id = auth.uid()
            AND memberships.company_id = integration_jobs.company_id
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_integration_jobs_updated_at
    BEFORE UPDATE ON public.integration_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add more fields to meta_assets/google_assets if needed for enhanced conversions
ALTER TABLE public.google_assets ADD COLUMN IF NOT EXISTS conversion_mapping JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.meta_assets ADD COLUMN IF NOT EXISTS conversion_mapping JSONB DEFAULT '{}'::jsonb;
