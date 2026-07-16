
-- Allowed domains per company for chat widget
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS chat_allowed_domains text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.is_chat_domain_allowed(p_company_id uuid, p_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN c.chat_allowed_domains IS NULL OR array_length(c.chat_allowed_domains, 1) IS NULL THEN true
      WHEN p_domain IS NULL OR p_domain = '' THEN false
      ELSE EXISTS (
        SELECT 1
        FROM unnest(c.chat_allowed_domains) AS d(pattern)
        WHERE lower(p_domain) = lower(d.pattern)
           OR lower(p_domain) LIKE '%.' || lower(d.pattern)
      )
    END
  FROM public.companies c
  WHERE c.id = p_company_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_domain_allowed(uuid, text) TO anon, authenticated;
