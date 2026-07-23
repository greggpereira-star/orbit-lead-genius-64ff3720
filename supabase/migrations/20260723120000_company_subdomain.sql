-- =========================================================================
-- Subdomínio personalizado grátis (ex: sossae.altleadflow.com.br)
-- =========================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_subdomain_format
  CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$');

CREATE INDEX IF NOT EXISTS idx_companies_subdomain ON public.companies(subdomain) WHERE subdomain IS NOT NULL;
