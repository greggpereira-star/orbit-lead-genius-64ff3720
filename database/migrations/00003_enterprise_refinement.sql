 -- Forms and Capture Module
 CREATE TABLE IF NOT EXISTS forms (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     name TEXT NOT NULL,
     config JSONB DEFAULT '{}'::jsonb,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 CREATE TABLE IF NOT EXISTS form_fields (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     form_id UUID REFERENCES forms(id) ON DELETE CASCADE NOT NULL,
     label TEXT NOT NULL,
     type TEXT NOT NULL, -- text, email, tel, select, etc.
     required BOOLEAN DEFAULT false,
     placeholder TEXT,
     sort_order INTEGER DEFAULT 0,
     options JSONB DEFAULT '[]'::jsonb
 );
 
 -- Tracking & Attribution
 CREATE TABLE IF NOT EXISTS sessions (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     visitor_id TEXT NOT NULL,
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
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 CREATE TABLE IF NOT EXISTS page_views (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
     url TEXT NOT NULL,
     title TEXT,
     duration_ms INTEGER,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Integrations
 CREATE TABLE IF NOT EXISTS integrations (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     provider TEXT NOT NULL, -- meta, google, cvcrm
     config JSONB DEFAULT '{}'::jsonb,
     status TEXT DEFAULT 'disconnected', -- connected, disconnected, error
     last_sync_at TIMESTAMP WITH TIME ZONE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Automations
 CREATE TABLE IF NOT EXISTS automations (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     name TEXT NOT NULL,
     trigger_type TEXT NOT NULL, -- lead_created, stage_changed, session_started
     config JSONB DEFAULT '{}'::jsonb,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- AI Analysis
 CREATE TABLE IF NOT EXISTS ai_analysis (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
     summary TEXT,
     sentiment TEXT,
     intent_score INTEGER, -- 0-100
     predictions JSONB DEFAULT '{}'::jsonb,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Audit Logs
 CREATE TABLE IF NOT EXISTS audit_logs (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     user_id UUID NOT NULL, -- Links to auth.users
     action TEXT NOT NULL,
     entity_type TEXT NOT NULL,
     entity_id UUID,
     changes JSONB,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Feature Flags
 CREATE TABLE IF NOT EXISTS feature_flags (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     flag_key TEXT NOT NULL,
     is_enabled BOOLEAN DEFAULT false,
     UNIQUE(company_id, flag_key)
 );
 
 -- Enable RLS for all new tables
 ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
 ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
 ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
 ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE ai_analysis ENABLE ROW LEVEL SECURITY;
 ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
 ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
 
 -- RLS Policies (Scoped by company_id via memberships)
 -- Generic function to check membership for RLS policies
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
 
 -- Apply policies to all tables (simplified for brevity here, but should be explicit)
 -- For each table, we add a policy like:
 -- CREATE POLICY "Company access" ON table_name USING (check_membership(company_id));
 
 CREATE POLICY "Company access forms" ON forms USING (check_membership(company_id));
 CREATE POLICY "Company access form_fields" ON form_fields USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_fields.form_id AND check_membership(forms.company_id)));
 CREATE POLICY "Company access sessions" ON sessions USING (check_membership(company_id));
 CREATE POLICY "Company access page_views" ON page_views USING (EXISTS (SELECT 1 FROM sessions WHERE sessions.id = page_views.session_id AND check_membership(sessions.company_id)));
 CREATE POLICY "Company access integrations" ON integrations USING (check_membership(company_id));
 CREATE POLICY "Company access automations" ON automations USING (check_membership(company_id));
 CREATE POLICY "Company access ai_analysis" ON ai_analysis USING (EXISTS (SELECT 1 FROM leads WHERE leads.id = ai_analysis.lead_id AND check_membership(leads.company_id)));
 CREATE POLICY "Company access audit_logs" ON audit_logs USING (check_membership(company_id));
 CREATE POLICY "Company access feature_flags" ON feature_flags USING (check_membership(company_id));