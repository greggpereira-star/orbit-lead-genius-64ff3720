-- Drop table if it partially exists to avoid column mismatch issues
DROP TABLE IF EXISTS public.system_logs;

-- Infrastructure Monitoring Tables
CREATE TABLE public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    level TEXT NOT NULL, -- info, warn, error, fatal
    message TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    trace_id TEXT,
    route TEXT,
    component TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to view logs of their own company
CREATE POLICY "System logs access" ON public.system_logs 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE memberships.company_id = system_logs.company_id 
    AND memberships.user_id = auth.uid()
));

-- Allow service role and edge functions to insert logs
CREATE POLICY "System logs insertion" ON public.system_logs 
FOR INSERT 
WITH CHECK (true);

-- Indexes for observability
CREATE INDEX IF NOT EXISTS idx_system_logs_company ON public.system_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_trace ON public.system_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs(created_at DESC);

-- Ensure update_updated_at_column exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;