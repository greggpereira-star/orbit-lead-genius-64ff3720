-- Consolidated Enterprise Schema Migration

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Multi-tenancy
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    branding JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Memberships
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role user_role DEFAULT 'member' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(company_id, user_id)
);

-- Pipeline Stages
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    city TEXT,
    status TEXT DEFAULT 'new' NOT NULL,
    score INTEGER DEFAULT 0,
    temperature TEXT DEFAULT 'cold',
    metadata JSONB DEFAULT '{}'::jsonb,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    gclid TEXT,
    fbclid TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Lead Events
CREATE TABLE IF NOT EXISTS lead_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'disconnected',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    provider TEXT NOT NULL DEFAULT 'cvcrm',
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    normalized_payload JSONB,
    headers JSONB,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- FUNCTIONS & TRIGGERS

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_company_id UUID;
    comp_name TEXT;
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

    comp_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company');
    
    INSERT INTO public.companies (name, slug)
    VALUES (comp_name, lower(regexp_replace(comp_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || floor(random()*1000)::text)
    RETURNING id INTO new_company_id;

    INSERT INTO public.memberships (company_id, user_id, role)
    VALUES (new_company_id, NEW.id, 'owner');

    INSERT INTO public.stages (company_id, name, order_index, color)
    VALUES 
        (new_company_id, 'New', 0, '#3b82f6'),
        (new_company_id, 'Contacted', 1, '#8b5cf6'),
        (new_company_id, 'Qualified', 2, '#10b981'),
        (new_company_id, 'Negotiation', 3, '#f59e0b'),
        (new_company_id, 'Closed Won', 4, '#10b981'),
        (new_company_id, 'Closed Lost', 5, '#ef4444');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- POLICIES
DROP POLICY IF EXISTS "Users can view their own memberships" ON memberships;
CREATE POLICY "Users can view their own memberships" ON memberships FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view companies they belong to" ON companies;
CREATE POLICY "Users can view companies they belong to" ON companies FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = companies.id AND memberships.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION check_membership(target_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.company_id = target_company_id
        AND memberships.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Leads access" ON leads;
CREATE POLICY "Leads access" ON leads FOR ALL USING (check_membership(company_id));

DROP POLICY IF EXISTS "Stages access" ON stages;
CREATE POLICY "Stages access" ON stages FOR ALL USING (check_membership(company_id));

DROP POLICY IF EXISTS "Lead events access" ON lead_events;
CREATE POLICY "Lead events access" ON lead_events FOR ALL USING (
    EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_events.lead_id AND check_membership(leads.company_id))
);

DROP POLICY IF EXISTS "Integrations access" ON integrations;
CREATE POLICY "Integrations access" ON integrations FOR ALL USING (check_membership(company_id));

-- CV.CRM Integration Tables
CREATE TABLE IF NOT EXISTS cvcrm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    cvcrm_base_url TEXT NOT NULL,
    api_user TEXT NOT NULL,
    api_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    connection_status TEXT DEFAULT 'disconnected',
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS cvcrm_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    processed_at TIMESTAMPTZ
);

ALTER TABLE cvcrm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvcrm_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CV CRM integrations access" ON cvcrm_integrations FOR ALL USING (check_membership(company_id));
CREATE POLICY "CV CRM sync queue access" ON cvcrm_sync_queue FOR ALL USING (check_membership(company_id));
