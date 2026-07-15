
-- =========================================================================
-- ALT QUIZ — Fase 1: fundação
-- =========================================================================

-- Enum de status
DO $$ BEGIN
  CREATE TYPE public.quiz_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quiz_layout_mode AS ENUM ('fullscreen','card','split','story','inline','modal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quiz_temperature AS ENUM ('hot','warm','cold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- Trigger util (usa a padrão do projeto se existir, senão cria)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.quiz_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================================
-- 1) quiz_funnels
-- =========================================================================
CREATE TABLE public.quiz_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  niche TEXT,
  description TEXT,
  status public.quiz_status NOT NULL DEFAULT 'draft',
  layout_mode public.quiz_layout_mode NOT NULL DEFAULT 'fullscreen',
  published_version_id UUID,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  design JSONB NOT NULL DEFAULT '{}'::jsonb,
  identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_response_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE INDEX idx_quiz_funnels_company ON public.quiz_funnels(company_id);
CREATE INDEX idx_quiz_funnels_slug ON public.quiz_funnels(slug) WHERE status='published';
CREATE INDEX idx_quiz_funnels_status ON public.quiz_funnels(company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_funnels TO authenticated;
GRANT SELECT ON public.quiz_funnels TO anon;
GRANT ALL ON public.quiz_funnels TO service_role;

ALTER TABLE public.quiz_funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_funnels members read"
  ON public.quiz_funnels FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE POLICY "quiz_funnels members insert"
  ON public.quiz_funnels FOR INSERT TO authenticated
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "quiz_funnels members update"
  ON public.quiz_funnels FOR UPDATE TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "quiz_funnels members delete"
  ON public.quiz_funnels FOR DELETE TO authenticated
  USING (public.check_membership(company_id));

-- Público (anon): só metadados mínimos de quiz publicado; front deve projetar colunas seguras
CREATE POLICY "quiz_funnels public read published"
  ON public.quiz_funnels FOR SELECT TO anon
  USING (status = 'published');

CREATE TRIGGER trg_quiz_funnels_updated_at BEFORE UPDATE ON public.quiz_funnels
  FOR EACH ROW EXECUTE FUNCTION public.quiz_touch_updated_at();

-- =========================================================================
-- 2) quiz_versions
-- =========================================================================
CREATE TABLE public.quiz_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quiz_funnels(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,   -- blocks, design, results, logic
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, version)
);

CREATE INDEX idx_quiz_versions_quiz ON public.quiz_versions(quiz_id);
CREATE INDEX idx_quiz_versions_published ON public.quiz_versions(quiz_id) WHERE is_published;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_versions TO authenticated;
GRANT SELECT ON public.quiz_versions TO anon;
GRANT ALL ON public.quiz_versions TO service_role;

ALTER TABLE public.quiz_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_versions members read"
  ON public.quiz_versions FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE POLICY "quiz_versions members write"
  ON public.quiz_versions FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "quiz_versions public read published"
  ON public.quiz_versions FOR SELECT TO anon
  USING (is_published = true);

CREATE TRIGGER trg_quiz_versions_updated_at BEFORE UPDATE ON public.quiz_versions
  FOR EACH ROW EXECUTE FUNCTION public.quiz_touch_updated_at();

ALTER TABLE public.quiz_funnels
  ADD CONSTRAINT quiz_funnels_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES public.quiz_versions(id) ON DELETE SET NULL;

-- =========================================================================
-- 3) quiz_media
-- =========================================================================
CREATE TABLE public.quiz_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quiz_id UUID REFERENCES public.quiz_funnels(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  media_type TEXT NOT NULL,          -- image | video | audio
  mime_type TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  thumbnail_url TEXT,
  alt_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_media_company ON public.quiz_media(company_id);
CREATE INDEX idx_quiz_media_quiz ON public.quiz_media(quiz_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_media TO authenticated;
GRANT ALL ON public.quiz_media TO service_role;

ALTER TABLE public.quiz_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_media members all"
  ON public.quiz_media FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE TRIGGER trg_quiz_media_updated_at BEFORE UPDATE ON public.quiz_media
  FOR EACH ROW EXECUTE FUNCTION public.quiz_touch_updated_at();

-- =========================================================================
-- 4) quiz_submissions
-- =========================================================================
CREATE TABLE public.quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quiz_funnels(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.quiz_versions(id) ON DELETE SET NULL,
  lead_id UUID,   -- FK opcional; leads pertence a outro módulo, sem ON DELETE aqui para não travar
  session_id TEXT,
  trace_id TEXT,
  status TEXT NOT NULL DEFAULT 'started',  -- started | completed | abandoned
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  temperature public.quiz_temperature,
  result_key TEXT,
  result_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  tracking JSONB NOT NULL DEFAULT '{}'::jsonb,   -- utm/fbp/fbc/gclid/ip/user_agent
  device JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_submissions_quiz ON public.quiz_submissions(quiz_id);
CREATE INDEX idx_quiz_submissions_company ON public.quiz_submissions(company_id);
CREATE INDEX idx_quiz_submissions_lead ON public.quiz_submissions(lead_id);
CREATE INDEX idx_quiz_submissions_created ON public.quiz_submissions(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_submissions TO authenticated;
GRANT INSERT ON public.quiz_submissions TO anon;
GRANT ALL ON public.quiz_submissions TO service_role;

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_submissions members read"
  ON public.quiz_submissions FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE POLICY "quiz_submissions members write"
  ON public.quiz_submissions FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

-- Public insert allowed only against published quizzes
CREATE POLICY "quiz_submissions public insert"
  ON public.quiz_submissions FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quiz_funnels q
            WHERE q.id = quiz_id AND q.company_id = quiz_submissions.company_id
              AND q.status = 'published')
  );

CREATE TRIGGER trg_quiz_submissions_updated_at BEFORE UPDATE ON public.quiz_submissions
  FOR EACH ROW EXECUTE FUNCTION public.quiz_touch_updated_at();

-- =========================================================================
-- 5) quiz_events
-- =========================================================================
CREATE TABLE public.quiz_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quiz_funnels(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.quiz_submissions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,   -- view | start | block_view | answer | lead_captured | complete | result_viewed | cta_click
  block_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id TEXT,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_events_quiz ON public.quiz_events(quiz_id, event_type);
CREATE INDEX idx_quiz_events_submission ON public.quiz_events(submission_id);
CREATE INDEX idx_quiz_events_created ON public.quiz_events(created_at DESC);

GRANT SELECT, INSERT ON public.quiz_events TO authenticated;
GRANT INSERT ON public.quiz_events TO anon;
GRANT ALL ON public.quiz_events TO service_role;

ALTER TABLE public.quiz_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_events members read"
  ON public.quiz_events FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

CREATE POLICY "quiz_events members insert"
  ON public.quiz_events FOR INSERT TO authenticated
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "quiz_events public insert"
  ON public.quiz_events FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quiz_funnels q
            WHERE q.id = quiz_id AND q.company_id = quiz_events.company_id
              AND q.status = 'published')
  );

-- =========================================================================
-- 6) quiz_templates (globais)
-- =========================================================================
CREATE TABLE public.quiz_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  niche TEXT,
  description TEXT,
  cover_url TEXT,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.quiz_templates TO authenticated, anon;
GRANT ALL ON public.quiz_templates TO service_role;

ALTER TABLE public.quiz_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_templates read active"
  ON public.quiz_templates FOR SELECT TO authenticated, anon
  USING (is_active = true);

CREATE TRIGGER trg_quiz_templates_updated_at BEFORE UPDATE ON public.quiz_templates
  FOR EACH ROW EXECUTE FUNCTION public.quiz_touch_updated_at();

-- Seed inicial de templates (placeholders — mídia será adicionada em fases posteriores)
INSERT INTO public.quiz_templates (slug, name, niche, description, sort_order, schema) VALUES
  ('imobiliario-premium','Quiz Imobiliário Premium','imobiliario','Qualifica compradores e agenda simulação.',10,'{"design":{"theme":"real_estate_premium"},"blocks":[],"results":[]}'::jsonb),
  ('estetica-antes-depois','Quiz Estética Antes/Depois','estetica','Descoberta de perfil para avaliação estética.',20,'{"design":{"theme":"beauty_aesthetic"},"blocks":[],"results":[]}'::jsonb),
  ('mentoria-high-ticket','Quiz Mentoria High Ticket','mentoria','Qualificação para mentoria premium.',30,'{"design":{"theme":"mentoria_high_ticket"},"blocks":[],"results":[]}'::jsonb),
  ('marketing-diagnostico','Quiz Marketing Diagnóstico','marketing','Diagnóstico de aquisição e conversão.',40,'{"design":{"theme":"premium_clean"},"blocks":[],"results":[]}'::jsonb),
  ('saude-avaliacao','Quiz Saúde / Avaliação','saude','Triagem inicial para avaliação.',50,'{"design":{"theme":"health_soft"},"blocks":[],"results":[]}'::jsonb),
  ('ecommerce-produto','Quiz Produto Ideal E-commerce','ecommerce','Recomendação de produto ideal.',60,'{"design":{"theme":"ecommerce_product"},"blocks":[],"results":[]}'::jsonb);
