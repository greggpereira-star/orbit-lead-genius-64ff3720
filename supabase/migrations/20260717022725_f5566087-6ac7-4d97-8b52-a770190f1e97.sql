
-- ============================================================
-- Bloco 1: Meta Lead Ads — formulários, mapeamentos, importação
-- ============================================================

-- 1) Ampliar meta_lead_forms
ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS page_name TEXT,
  ADD COLUMN IF NOT EXISTS leads_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'meta_lead_forms_company_form_unique'
  ) THEN
    CREATE UNIQUE INDEX meta_lead_forms_company_form_unique
      ON public.meta_lead_forms (company_id, form_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS meta_lead_forms_page_idx
  ON public.meta_lead_forms (company_id, page_id);

-- 2) Ampliar meta_lead_events
ALTER TABLE public.meta_lead_events
  ADD COLUMN IF NOT EXISTS fetched_lead_payload JSONB,
  ADD COLUMN IF NOT EXISTS normalized_payload JSONB,
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

CREATE INDEX IF NOT EXISTS meta_lead_events_status_idx
  ON public.meta_lead_events (company_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS meta_lead_events_form_idx
  ON public.meta_lead_events (form_id, received_at DESC);

-- 3) meta_form_mappings
CREATE TABLE IF NOT EXISTS public.meta_form_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT,
  form_id TEXT NOT NULL,
  form_name TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,

  source TEXT NOT NULL DEFAULT 'facebook',
  channel TEXT NOT NULL DEFAULT 'meta_lead_ads',
  medium TEXT NOT NULL DEFAULT 'lead_ads',

  default_utm_source TEXT,
  default_utm_medium TEXT,
  default_utm_campaign TEXT,

  pipeline_id UUID,
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  default_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_score INTEGER NOT NULL DEFAULT 0,
  default_temperature TEXT,

  qualification_rules JSONB NOT NULL DEFAULT '[]'::jsonb,

  external_crm_enabled BOOLEAN NOT NULL DEFAULT false,
  external_crm_provider TEXT,
  external_crm_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_crm_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, form_id)
);

CREATE INDEX IF NOT EXISTS meta_form_mappings_company_idx
  ON public.meta_form_mappings (company_id, is_active);
CREATE INDEX IF NOT EXISTS meta_form_mappings_page_idx
  ON public.meta_form_mappings (company_id, page_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_form_mappings TO authenticated;
GRANT ALL ON public.meta_form_mappings TO service_role;

ALTER TABLE public.meta_form_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage meta_form_mappings"
  ON public.meta_form_mappings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = meta_form_mappings.company_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = meta_form_mappings.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_meta_form_mappings_updated_at
  BEFORE UPDATE ON public.meta_form_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) meta_lead_import_jobs
CREATE TABLE IF NOT EXISTS public.meta_lead_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  page_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  since TIMESTAMPTZ,
  until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_found INTEGER NOT NULL DEFAULT 0,
  total_imported INTEGER NOT NULL DEFAULT 0,
  total_duplicates INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  trace_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_lead_import_jobs_company_idx
  ON public.meta_lead_import_jobs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meta_lead_import_jobs_form_idx
  ON public.meta_lead_import_jobs (form_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_lead_import_jobs TO authenticated;
GRANT ALL ON public.meta_lead_import_jobs TO service_role;

ALTER TABLE public.meta_lead_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage meta_lead_import_jobs"
  ON public.meta_lead_import_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = meta_lead_import_jobs.company_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = meta_lead_import_jobs.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_meta_lead_import_jobs_updated_at
  BEFORE UPDATE ON public.meta_lead_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
