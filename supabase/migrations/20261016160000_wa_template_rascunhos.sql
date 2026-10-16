-- ===========================================================================
-- WhatsApp: rascunhos de template
-- ===========================================================================
-- O autor monta o template, salva e volta depois — sem criar nada na Meta.
-- Fica fora de `wa_templates` de propósito: aquela tabela espelha o que a Meta
-- tem (status, rejeição) e é reescrita pela sincronização.
--
-- Escrita só pelo servidor (papel conferido lá); a equipe da empresa lê.

CREATE TABLE IF NOT EXISTS public.wa_template_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 512),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_template_drafts_empresa_idx
  ON public.wa_template_drafts (company_id, updated_at DESC);

ALTER TABLE public.wa_template_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_template_drafts_leitura ON public.wa_template_drafts;
CREATE POLICY wa_template_drafts_leitura ON public.wa_template_drafts
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

REVOKE ALL ON public.wa_template_drafts FROM authenticated, anon;
GRANT SELECT ON public.wa_template_drafts TO authenticated;
GRANT ALL ON public.wa_template_drafts TO service_role;
