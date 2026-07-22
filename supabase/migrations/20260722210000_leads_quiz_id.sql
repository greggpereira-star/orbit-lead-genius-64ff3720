-- =========================================================================
-- ALT QUIZ — Fase 6: Kanban de leads dedicado ao quiz
-- =========================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES public.quiz_funnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_quiz_id ON public.leads(quiz_id) WHERE quiz_id IS NOT NULL;

-- Backfill leads created via quiz before this migration, where the
-- association only existed inside metadata->>'quiz_id' (jsonb).
UPDATE public.leads
SET quiz_id = (metadata->>'quiz_id')::uuid
WHERE quiz_id IS NULL
  AND metadata ? 'quiz_id'
  AND metadata->>'quiz_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
