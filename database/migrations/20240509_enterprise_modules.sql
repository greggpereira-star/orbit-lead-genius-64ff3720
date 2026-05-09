-- Migration: Enterprise SaaS CRM + Lead Intelligence Platform
-- Módulo 1, 3, 4, 5 tables

-- CV.CRM Integrations (detailed per company)
CREATE TABLE IF NOT EXISTS cvcrm_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    cvcrm_base_url TEXT NOT NULL,
    api_user TEXT NOT NULL,
    api_token TEXT NOT NULL,
    webhook_secret TEXT,
    is_active BOOLEAN DEFAULT true,
    connection_status TEXT DEFAULT 'pending', -- connected, error, pending
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS cvcrm_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    direction TEXT NOT NULL, -- inbound, outbound
    payload_sent JSONB,
    payload_received JSONB,
    status_code INT,
    request_id TEXT,
    latency_ms INT,
    error_message TEXT,
    retries INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cvcrm_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    payload JSONB,
    event_type TEXT,
    status TEXT DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cvcrm_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- lead, pipeline, etc
    entity_id UUID NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INT DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automation Engine
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL, -- lead.created, lead.qualified, etc
    conditions JSONB DEFAULT '[]',
    actions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    entity_id UUID, -- lead_id, etc
    status TEXT DEFAULT 'success', -- success, failure
    duration_ms INT,
    logs JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
    entity_id UUID,
    payload JSONB,
    status TEXT DEFAULT 'pending',
    attempts INT DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Integration Center
CREATE TABLE IF NOT EXISTS integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- facebook, google, cvcrm
    credentials JSONB NOT NULL, -- encrypted in real production
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMPTZ,
    health_status TEXT DEFAULT 'ok', -- ok, error
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, provider)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Attribution & Scoring
CREATE TABLE IF NOT EXISTS lead_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    temperature TEXT DEFAULT 'cold',
    quality_signals JSONB DEFAULT '{}',
    intent_signals JSONB DEFAULT '{}',
    prediction_model_version TEXT,
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE(lead_id)
);

CREATE TABLE IF NOT EXISTS lead_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    previous_score INT,
    new_score INT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_attribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    first_touch_id UUID,
    last_touch_id UUID,
    conversion_touch_id UUID,
    attribution_model TEXT DEFAULT 'linear', -- linear, first_touch, last_touch, w-shaped
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(lead_id)
);

CREATE TABLE IF NOT EXISTS lead_touchpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- session, click, form, whatsapp
    source TEXT,
    medium TEXT,
    campaign TEXT,
    content TEXT,
    term TEXT,
    url TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to leads if they don't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cvcrm_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending'; -- pending, synced, error
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;