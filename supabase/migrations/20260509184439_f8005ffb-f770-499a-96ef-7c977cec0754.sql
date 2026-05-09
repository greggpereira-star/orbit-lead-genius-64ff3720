-- 1. OAuth Connections (Enterprise Token Lifecycle)
CREATE TABLE IF NOT EXISTS public.oauth_connections (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'meta', 'google'
    external_id TEXT, -- User ID from provider
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'active', -- 'active', 'expired', 'revoked'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, provider)
);

-- 2. Meta Assets Discovery (Pages, Ad Accounts, Forms)
CREATE TABLE IF NOT EXISTS public.meta_assets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'page', 'ad_account', 'lead_form'
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, asset_type, external_id)
);

-- 3. Google Assets Discovery
CREATE TABLE IF NOT EXISTS public.google_assets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'ad_account', 'conversion_action'
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, asset_type, external_id)
);

-- 4. Webhook Subscriptions (Real-time Lead Capture)
CREATE TABLE IF NOT EXISTS public.integration_webhooks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT, -- Webhook ID from provider
    target_asset_id TEXT, -- Page ID for Meta, etc.
    status TEXT DEFAULT 'active',
    last_event_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Enhanced Lead Capture Logs (Forensic Audit)
CREATE TABLE IF NOT EXISTS public.lead_capture_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_lead_id TEXT,
    payload JSONB,
    status TEXT, -- 'captured', 'enriched', 'delivered', 'failed'
    error_message TEXT,
    trace_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS Policies for Tenant Isolation

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company oauth connections" ON public.oauth_connections FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = oauth_connections.company_id));

ALTER TABLE public.meta_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company meta assets" ON public.meta_assets FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = meta_assets.company_id));

ALTER TABLE public.google_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company google assets" ON public.google_assets FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = google_assets.company_id));

ALTER TABLE public.integration_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their company webhooks" ON public.integration_webhooks FOR ALL USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = integration_webhooks.company_id));

ALTER TABLE public.lead_capture_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their company lead logs" ON public.lead_capture_logs FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_capture_logs.company_id));

-- Triggers for updated_at
CREATE TRIGGER update_oauth_connections_updated_at BEFORE UPDATE ON public.oauth_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_meta_assets_updated_at BEFORE UPDATE ON public.meta_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_google_assets_updated_at BEFORE UPDATE ON public.google_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
