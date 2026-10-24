-- Permissão "excluir lead".
--
-- Medido em produção: duas políticas `FOR ALL` por `check_membership` davam
-- DELETE (e INSERT) a QUALQUER membro da empresa, visualizador incluído — a
-- exclusão apaga o lead e dez tabelas em cascata, sem desfazer.
--
-- Agora:
--   owner/admin   sempre excluem;
--   member        só se a empresa liberar (`company_permissoes.membros_excluem_leads`,
--                 padrão FALSO);
--   viewer        nunca.
--
-- Inserir lead pelo navegador continua como era (qualquer membro): a política
-- de INSERT que as duas `FOR ALL` davam passa a ser explícita. SELECT e UPDATE
-- seguem nas políticas "Users can view/update their company leads", que já
-- existem e não mudam. A captura pública (anon) não muda.
--
-- `company_permissoes` é a casa das próximas permissões por empresa (exportar,
-- criar etiquetas, etc.): uma coluna booleana por permissão.

CREATE TABLE IF NOT EXISTS public.company_permissoes (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  membros_excluem_leads boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.company_permissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_permissoes_leitura ON public.company_permissoes;
CREATE POLICY company_permissoes_leitura ON public.company_permissoes
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
REVOKE ALL ON public.company_permissoes FROM authenticated, anon;
GRANT SELECT ON public.company_permissoes TO authenticated;
GRANT ALL ON public.company_permissoes TO service_role;

CREATE OR REPLACE FUNCTION public.pode_excluir_lead(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.user_id = auth.uid()
       AND m.company_id = p_company_id
       AND (
         m.role IN ('owner', 'admin')
         OR (m.role = 'member' AND COALESCE(
               (SELECT p.membros_excluem_leads FROM public.company_permissoes p
                 WHERE p.company_id = p_company_id), false))
       )
  );
$$;
REVOKE ALL ON FUNCTION public.pode_excluir_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_excluir_lead(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Leads access" ON public.leads;
DROP POLICY IF EXISTS "Users can manage their company leads" ON public.leads;

DROP POLICY IF EXISTS leads_inserir_membro ON public.leads;
CREATE POLICY leads_inserir_membro ON public.leads
  FOR INSERT TO authenticated WITH CHECK (public.check_membership(company_id));

DROP POLICY IF EXISTS leads_excluir ON public.leads;
CREATE POLICY leads_excluir ON public.leads
  FOR DELETE TO authenticated USING (public.pode_excluir_lead(company_id));
