 -- Lead Events Table for timeline
 CREATE TABLE IF NOT EXISTS lead_events (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
     event_type TEXT NOT NULL, -- capture, stage_change, note, email, call, meeting
     description TEXT,
     metadata JSONB DEFAULT '{}'::jsonb,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Automation Runs Table
 CREATE TABLE IF NOT EXISTS automation_runs (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
     lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
     status TEXT NOT NULL, -- success, failed, pending
     output JSONB,
     error TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Routing Configurations (Round Robin)
 CREATE TABLE IF NOT EXISTS routing_configs (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     name TEXT NOT NULL,
     is_active BOOLEAN DEFAULT true,
     routing_type TEXT DEFAULT 'round_robin' NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Routing Group Members
 CREATE TABLE IF NOT EXISTS routing_members (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     config_id UUID REFERENCES routing_configs(id) ON DELETE CASCADE NOT NULL,
     user_id UUID NOT NULL, -- auth.users
     last_assigned_at TIMESTAMP WITH TIME ZONE,
     weight INTEGER DEFAULT 1,
     is_available BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Enable RLS
 ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
 ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
 ALTER TABLE routing_configs ENABLE ROW LEVEL SECURITY;
 ALTER TABLE routing_members ENABLE ROW LEVEL SECURITY;
 
 -- Policies
 CREATE POLICY "Company access lead_events" ON lead_events USING (EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_events.lead_id AND check_membership(leads.company_id)));
 CREATE POLICY "Company access automation_runs" ON automation_runs USING (EXISTS (SELECT 1 FROM automations WHERE automations.id = automation_runs.automation_id AND check_membership(automations.company_id)));
 CREATE POLICY "Company access routing_configs" ON routing_configs USING (check_membership(company_id));
 CREATE POLICY "Company access routing_members" ON routing_members USING (EXISTS (SELECT 1 FROM routing_configs WHERE routing_configs.id = routing_members.config_id AND check_membership(routing_configs.company_id)));