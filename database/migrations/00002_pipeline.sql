 -- Pipeline and Stages
 CREATE TABLE IF NOT EXISTS stages (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     name TEXT NOT NULL,
     color TEXT DEFAULT '#3b82f6',
     order_index INTEGER DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Add stage_id to leads
 ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES stages(id) ON DELETE SET NULL;
 
 -- Enable RLS for stages
 ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
 
 -- RLS Policies for stages
 CREATE POLICY "Users can view stages from their companies"
 ON stages FOR SELECT
 USING (
     EXISTS (
         SELECT 1 FROM memberships
         WHERE memberships.company_id = stages.company_id
         AND memberships.user_id = auth.uid()
     )
 );
 
 -- Default stages for new companies function
 CREATE OR REPLACE FUNCTION public.setup_default_stages()
 RETURNS TRIGGER AS $$
 BEGIN
     INSERT INTO stages (company_id, name, order_index, color)
     VALUES 
         (NEW.id, 'New', 0, '#3b82f6'),
         (NEW.id, 'Contacted', 1, '#8b5cf6'),
         (NEW.id, 'Qualified', 2, '#10b981'),
         (NEW.id, 'Negotiation', 3, '#f59e0b'),
         (NEW.id, 'Closed Won', 4, '#10b981'),
         (NEW.id, 'Closed Lost', 5, '#ef4444');
     RETURN NEW;
 END;
 $$ LANGUAGE plpgsql SECURITY DEFINER;
 
 -- Trigger to create default stages when a company is created
 CREATE TRIGGER on_company_created
     AFTER INSERT ON companies
     FOR EACH ROW EXECUTE FUNCTION public.setup_default_stages();