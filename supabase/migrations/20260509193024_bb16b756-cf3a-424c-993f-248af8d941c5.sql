-- Table for storing OAuth connections (encrypted tokens recommended in production)
CREATE TABLE IF NOT EXISTS public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'meta' or 'google'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id, provider)
);

-- Table for Meta Assets (Pages, Ad Accounts, Forms, Pixels)
CREATE TABLE IF NOT EXISTS public.meta_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'page', 'ad_account', 'form', 'pixel', 'business'
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id, asset_type, external_id)
);

-- Table for Google Assets (MCC, Child Accounts, Conversion Actions)
CREATE TABLE IF NOT EXISTS public.google_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'mcc', 'account', 'conversion_action', 'gtm_container'
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id, asset_type, external_id)
);

-- Table for Lead Sync Logs
CREATE TABLE IF NOT EXISTS public.lead_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_lead_id TEXT NOT NULL,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Users can only see data for their own companies)
CREATE POLICY "Users can view their company's OAuth connections"
ON public.oauth_connections FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = oauth_connections.company_id
    AND memberships.user_id = auth.uid()
));

CREATE POLICY "Users can view their company's Meta assets"
ON public.meta_assets FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = meta_assets.company_id
    AND memberships.user_id = auth.uid()
));

CREATE POLICY "Users can update their company's Meta assets"
ON public.meta_assets FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = meta_assets.company_id
    AND memberships.user_id = auth.uid()
));

CREATE POLICY "Users can view their company's Google assets"
ON public.google_assets FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = google_assets.company_id
    AND memberships.user_id = auth.uid()
));

CREATE POLICY "Users can update their company's Google assets"
ON public.google_assets FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = google_assets.company_id
    AND memberships.user_id = auth.uid()
));
