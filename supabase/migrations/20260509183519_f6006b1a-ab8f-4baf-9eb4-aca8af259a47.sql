-- Enable RLS
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.integrations ENABLE ROW LEVEL SECURITY;

-- 1. Create leads table if not exists (base for all capture)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'new',
    source TEXT,
    
    -- Attribution & Tracking
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    gclid TEXT,
    fbclid TEXT,
    landing_page TEXT,
    referrer TEXT,
    device_info JSONB,
    location_info JSONB,
    
    -- Scoring & Intelligence
    lead_score INTEGER DEFAULT 0,
    lead_temperature TEXT DEFAULT 'cold',
    
    -- Integration state
    cvcrm_id TEXT,
    sync_status TEXT DEFAULT 'pending',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Create cvcrm_integrations table
CREATE TABLE IF NOT EXISTS public.cvcrm_integrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL UNIQUE,
    cvcrm_base_url TEXT NOT NULL,
    api_user TEXT NOT NULL,
    api_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    connection_status TEXT DEFAULT 'disconnected',
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create cvcrm_sync_queue table
CREATE TABLE IF NOT EXISTS public.cvcrm_sync_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    entity_type TEXT NOT NULL, -- 'lead'
    entity_id UUID NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create cvcrm_sync_logs table (Enterprise Audit)
CREATE TABLE IF NOT EXISTS public.cvcrm_sync_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    lead_id UUID,
    direction TEXT DEFAULT 'outbound',
    payload_sent JSONB,
    payload_received JSONB,
    status_code INTEGER,
    request_id UUID,
    latency_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create integrations table for UI mapping if not exists
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'disconnected',
    config JSONB DEFAULT '{}'::jsonb,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, provider)
);

-- RLS Policies

-- Leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their company leads" ON public.leads FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = leads.company_id));
CREATE POLICY "Users can create company leads" ON public.leads FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = company_id));

-- CV.CRM Integrations
ALTER TABLE public.cvcrm_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company cvcrm integration" ON public.cvcrm_integrations FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_integrations.company_id));

-- CV.CRM Queue
ALTER TABLE public.cvcrm_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their company sync queue" ON public.cvcrm_sync_queue FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_sync_queue.company_id));

-- CV.CRM Logs
ALTER TABLE public.cvcrm_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their company sync logs" ON public.cvcrm_sync_logs FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_sync_logs.company_id));

-- General Integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company integrations" ON public.integrations FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = integrations.company_id));

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cvcrm_integrations_updated_at BEFORE UPDATE ON public.cvcrm_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cvcrm_sync_queue_updated_at BEFORE UPDATE ON public.cvcrm_sync_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
