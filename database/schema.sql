-- STEP 2: DATABASE SCHEMA - ENTERPRISE SaaS CRM

-- Core & Multi-tenancy
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    branding JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Feature Flags & Subscriptions
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    flag_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    UNIQUE(company_id, flag_key)
);

-- Lead Capture Module
CREATE TABLE forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE form_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    required BOOLEAN DEFAULT false,
    placeholder TEXT,
    sort_order INT DEFAULT 0
);

-- Leads & CRM
CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false
);

CREATE TABLE pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0
);

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    stage_id UUID REFERENCES pipeline_stages(id),
    name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    income NUMERIC,
    price_range TEXT,
    source TEXT,
    status TEXT DEFAULT 'new',
    temperature TEXT DEFAULT 'cold', -- hot, warm, cold
    score INT DEFAULT 0,
    assigned_to UUID REFERENCES users(id),
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    gclid TEXT,
    fbclid TEXT,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    landing_page TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lead_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tracking & Attribution
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    visitor_id TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Integrations & Automations
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    provider TEXT NOT NULL, -- meta, google, cvcrm
    config JSONB DEFAULT '{}',
    status TEXT DEFAULT 'disconnected',
    last_sync_at TIMESTAMPTZ
);

CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

-- AI Intelligence
CREATE TABLE ai_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    summary TEXT,
    sentiment TEXT,
    intent_score INT,
    predictions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Auditing
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
