-- First, ensure check_membership is as fast as possible
CREATE OR REPLACE FUNCTION public.check_membership(p_company_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE user_id = auth.uid() AND company_id = p_company_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Optimize Profiles RLS
DROP POLICY IF EXISTS "Users can view profiles of tenant members" ON public.profiles;
CREATE POLICY "Users can view profiles of tenant members" ON public.profiles
FOR SELECT USING (
  (auth.uid() = id) OR 
  EXISTS (
    SELECT 1 FROM public.memberships m1
    JOIN public.memberships m2 ON m1.company_id = m2.company_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
  )
);

-- Optimize Leads RLS
DROP POLICY IF EXISTS "Users can view their company leads" ON public.leads;
CREATE POLICY "Users can view their company leads" ON public.leads
FOR SELECT USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can update their company leads" ON public.leads;
CREATE POLICY "Users can update their company leads" ON public.leads
FOR UPDATE USING (check_membership(company_id));

-- Optimize Integrations RLS
DROP POLICY IF EXISTS "Users can manage their company integrations" ON public.integrations;
CREATE POLICY "Users can manage their company integrations" ON public.integrations
FOR ALL USING (check_membership(company_id));

-- Optimize OAuth Connections
DROP POLICY IF EXISTS "Users can manage their company oauth connections" ON public.oauth_connections;
CREATE POLICY "Users can manage their company oauth connections" ON public.oauth_connections
FOR ALL USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can view their company's OAuth connections" ON public.oauth_connections;
CREATE POLICY "Users can view their company's OAuth connections" ON public.oauth_connections
FOR SELECT USING (check_membership(company_id));

-- Optimize Meta Assets
DROP POLICY IF EXISTS "Users can manage their company meta assets" ON public.meta_assets;
CREATE POLICY "Users can manage their company meta assets" ON public.meta_assets
FOR ALL USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can view their company's Meta assets" ON public.meta_assets;
CREATE POLICY "Users can view their company's Meta assets" ON public.meta_assets
FOR SELECT USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can update their company's Meta assets" ON public.meta_assets;
CREATE POLICY "Users can update their company's Meta assets" ON public.meta_assets
FOR UPDATE USING (check_membership(company_id));

-- Optimize Google Assets
DROP POLICY IF EXISTS "Users can manage their company google assets" ON public.google_assets;
CREATE POLICY "Users can manage their company google assets" ON public.google_assets
FOR ALL USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can view their company's Google assets" ON public.google_assets;
CREATE POLICY "Users can view their company's Google assets" ON public.google_assets
FOR SELECT USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can update their company's Google assets" ON public.google_assets;
CREATE POLICY "Users can update their company's Google assets" ON public.google_assets
FOR UPDATE USING (check_membership(company_id));

-- Optimize Lead Logs
DROP POLICY IF EXISTS "Users can view their company lead logs" ON public.lead_capture_logs;
CREATE POLICY "Users can view their company lead logs" ON public.lead_capture_logs
FOR SELECT USING (check_membership(company_id));

-- Optimize Webhooks
DROP POLICY IF EXISTS "Users can manage their company webhooks" ON public.integration_webhooks;
CREATE POLICY "Users can manage their company webhooks" ON public.integration_webhooks
FOR ALL USING (check_membership(company_id));

-- Optimize CV CRM Integrations
DROP POLICY IF EXISTS "Users can manage their company cvcrm integration" ON public.cvcrm_integrations;
CREATE POLICY "Users can manage their company cvcrm integration" ON public.cvcrm_integrations
FOR ALL USING (check_membership(company_id));

-- Optimize Sync Queues
DROP POLICY IF EXISTS "Users can view their company sync queue" ON public.cvcrm_sync_queue;
CREATE POLICY "Users can view their company sync queue" ON public.cvcrm_sync_queue
FOR SELECT USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can view their company sync logs" ON public.cvcrm_sync_logs;
CREATE POLICY "Users can view their company sync logs" ON public.cvcrm_sync_logs
FOR SELECT USING (check_membership(company_id));

-- Additional indexes to ensure these queries are instant
CREATE INDEX IF NOT EXISTS idx_memberships_company_user ON public.memberships (company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id_full ON public.profiles (id);
