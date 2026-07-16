
-- =============================================================
-- META LEAD ADS INTEGRATION
-- =============================================================

-- 1) Conexões OAuth por empresa (long-lived user token)
CREATE TABLE public.meta_lead_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  meta_user_id text NOT NULL,
  meta_user_name text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

GRANT SELECT ON public.meta_lead_connections TO authenticated;
GRANT ALL ON public.meta_lead_connections TO service_role;
ALTER TABLE public.meta_lead_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_conn_read_own_company" ON public.meta_lead_connections
  FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE TRIGGER trg_meta_lead_connections_updated
  BEFORE UPDATE ON public.meta_lead_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Páginas conectadas
CREATE TABLE public.meta_lead_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.meta_lead_connections(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text NOT NULL,
  page_access_token text NOT NULL,
  category text,
  subscribed boolean NOT NULL DEFAULT false,
  subscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, page_id)
);

GRANT SELECT ON public.meta_lead_pages TO authenticated;
GRANT ALL ON public.meta_lead_pages TO service_role;
ALTER TABLE public.meta_lead_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_pages_read_own_company" ON public.meta_lead_pages
  FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE TRIGGER trg_meta_lead_pages_updated
  BEFORE UPDATE ON public.meta_lead_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_meta_lead_pages_page_id ON public.meta_lead_pages(page_id);

-- 3) Formulários Lead Ads
CREATE TABLE public.meta_lead_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  form_id text NOT NULL,
  form_name text NOT NULL,
  status text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, form_id)
);

GRANT SELECT, UPDATE ON public.meta_lead_forms TO authenticated;
GRANT ALL ON public.meta_lead_forms TO service_role;
ALTER TABLE public.meta_lead_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_forms_read_own_company" ON public.meta_lead_forms
  FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE POLICY "meta_forms_update_own_company" ON public.meta_lead_forms
  FOR UPDATE TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE TRIGGER trg_meta_lead_forms_updated
  BEFORE UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_meta_lead_forms_page ON public.meta_lead_forms(page_id);

-- 4) Log de eventos do webhook (idempotência por leadgen_id)
CREATE TABLE public.meta_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  leadgen_id text NOT NULL,
  page_id text NOT NULL,
  form_id text,
  ad_id text,
  raw_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed','skipped')),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(leadgen_id)
);

GRANT SELECT ON public.meta_lead_events TO authenticated;
GRANT ALL ON public.meta_lead_events TO service_role;
ALTER TABLE public.meta_lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_events_read_own_company" ON public.meta_lead_events
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.check_membership(company_id));

CREATE TRIGGER trg_meta_lead_events_updated
  BEFORE UPDATE ON public.meta_lead_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_meta_lead_events_status ON public.meta_lead_events(status, received_at DESC);
CREATE INDEX idx_meta_lead_events_company ON public.meta_lead_events(company_id, received_at DESC);
