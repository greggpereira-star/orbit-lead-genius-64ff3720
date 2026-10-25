-- Permissões de estrutura: criar etapas, etiquetas novas e campos personalizados.
--
-- Medido em produção, antes desta migration:
--   etapas   (stages)             qualquer membro criava, reordenava e APAGAVA etapas
--                                 (política `Stages access` por check_membership);
--   etiquetas (lead_tags)         qualquer membro criava etiqueta nova — e a etiqueta
--                                 pode mover o lead de etapa e gerar conversão;
--   campos   (custom_field_defs)  já eram só de dono/administrador, sem opção.
--
-- Agora cada uma tem sua chave por empresa em `company_permissoes`:
--   membros_gerenciam_etapas   padrão FALSO
--   membros_criam_etiquetas    padrão VERDADEIRO (uso diário; aplicar uma etiqueta que a
--                              empresa já usa continua livre mesmo com a chave desligada)
--   membros_criam_campos       padrão FALSO (mantém o que já valia)
-- Dono e administrador sempre podem; visualizador nunca.
--
-- Esta migration também fecha o visualizador em tabelas que a medição anterior deixou
-- escapar (o filtro descartava políticas escritas como `m.user_id = auth.uid()`):
-- lead_tags, form_tag_rules, form_scoring_rules, form_temperature_rules,
-- conversion_mapping, meta_form_mappings, meta_lead_import_jobs, integration_jobs.

ALTER TABLE public.company_permissoes
  ADD COLUMN IF NOT EXISTS membros_gerenciam_etapas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS membros_criam_etiquetas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS membros_criam_campos boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_estrutura(p_company_id uuid, p_tipo text)
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
               (SELECT CASE p_tipo
                         WHEN 'etapas'    THEN p.membros_gerenciam_etapas
                         WHEN 'etiquetas' THEN p.membros_criam_etiquetas
                         WHEN 'campos'    THEN p.membros_criam_campos
                       END
                  FROM public.company_permissoes p
                 WHERE p.company_id = p_company_id),
               p_tipo = 'etiquetas'))
       )
  );
$$;
REVOKE ALL ON FUNCTION public.pode_gerenciar_estrutura(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar_estrutura(uuid, text) TO authenticated, service_role;

-- A etiqueta já é usada por algum lead da empresa? (sem diferenciar maiúscula)
CREATE OR REPLACE FUNCTION public.etiqueta_ja_existe(p_company_id uuid, p_tag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_tags t
      JOIN public.leads l ON l.id = t.lead_id
     WHERE l.company_id = p_company_id
       AND lower(t.tag_name) = lower(p_tag)
  );
$$;
REVOKE ALL ON FUNCTION public.etiqueta_ja_existe(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.etiqueta_ja_existe(uuid, text) TO authenticated, service_role;

-- Empresa do lead da etiqueta (lead_tags.company_id é anulável e não é confiável).
CREATE OR REPLACE FUNCTION public.empresa_do_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT company_id FROM public.leads WHERE id = p_lead_id;
$$;
REVOKE ALL ON FUNCTION public.empresa_do_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_do_lead(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Etapas: sai o `FOR ALL` por membro; leitura segue na política de SELECT que já existe.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Stages access" ON public.stages;
DROP POLICY IF EXISTS "Admins can manage company stages" ON public.stages;
DROP POLICY IF EXISTS stages_inserir ON public.stages;
DROP POLICY IF EXISTS stages_alterar ON public.stages;
DROP POLICY IF EXISTS stages_apagar ON public.stages;
CREATE POLICY stages_inserir ON public.stages FOR INSERT TO authenticated
  WITH CHECK (public.pode_gerenciar_estrutura(company_id, 'etapas'));
CREATE POLICY stages_alterar ON public.stages FOR UPDATE TO authenticated
  USING (public.pode_gerenciar_estrutura(company_id, 'etapas'))
  WITH CHECK (public.pode_gerenciar_estrutura(company_id, 'etapas'));
CREATE POLICY stages_apagar ON public.stages FOR DELETE TO authenticated
  USING (public.pode_gerenciar_estrutura(company_id, 'etapas'));

-- ---------------------------------------------------------------------------
-- Campos personalizados: mesma regra, agora com a chave da empresa.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS custom_field_defs_escrita ON public.custom_field_defs;
DROP POLICY IF EXISTS custom_field_defs_inserir ON public.custom_field_defs;
DROP POLICY IF EXISTS custom_field_defs_alterar ON public.custom_field_defs;
DROP POLICY IF EXISTS custom_field_defs_apagar ON public.custom_field_defs;
CREATE POLICY custom_field_defs_inserir ON public.custom_field_defs FOR INSERT TO authenticated
  WITH CHECK (public.pode_gerenciar_estrutura(company_id, 'campos'));
CREATE POLICY custom_field_defs_alterar ON public.custom_field_defs FOR UPDATE TO authenticated
  USING (public.pode_gerenciar_estrutura(company_id, 'campos'))
  WITH CHECK (public.pode_gerenciar_estrutura(company_id, 'campos'));
CREATE POLICY custom_field_defs_apagar ON public.custom_field_defs FOR DELETE TO authenticated
  USING (public.pode_gerenciar_estrutura(company_id, 'campos'));

-- ---------------------------------------------------------------------------
-- Etiquetas: política RESTRITIVA (soma-se às permissivas, só barra).
--   inserir   visualizador nunca; etiqueta NOVA só com a chave (ou admin);
--             aplicar uma que a empresa já usa é livre para quem atende;
--   alterar   idem à inserção, sobre a linha nova;
--   apagar    quem atende.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS etiquetas_inserir ON public.lead_tags;
DROP POLICY IF EXISTS etiquetas_alterar ON public.lead_tags;
DROP POLICY IF EXISTS etiquetas_apagar ON public.lead_tags;
CREATE POLICY etiquetas_inserir ON public.lead_tags AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id))
    AND (public.pode_gerenciar_estrutura(public.empresa_do_lead(lead_id), 'etiquetas')
         OR public.etiqueta_ja_existe(public.empresa_do_lead(lead_id), tag_name))
  );
CREATE POLICY etiquetas_alterar ON public.lead_tags AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)))
  WITH CHECK (
    public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id))
    AND (public.pode_gerenciar_estrutura(public.empresa_do_lead(lead_id), 'etiquetas')
         OR public.etiqueta_ja_existe(public.empresa_do_lead(lead_id), tag_name))
  );
CREATE POLICY etiquetas_apagar ON public.lead_tags AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)));

-- ---------------------------------------------------------------------------
-- Visualizador só lê, nas tabelas que a migration 20261026160000 deixou escapar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'form_tag_rules','form_scoring_rules','form_temperature_rules',
    'conversion_mapping','meta_form_mappings','meta_lead_import_jobs','integration_jobs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leitura_apenas_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leitura_apenas_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leitura_apenas_delete', t);
    EXECUTE format(
      'CREATE POLICY leitura_apenas_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.pode_escrever_na_empresa(company_id))', t);
    EXECUTE format(
      'CREATE POLICY leitura_apenas_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.pode_escrever_na_empresa(company_id))
         WITH CHECK (public.pode_escrever_na_empresa(company_id))', t);
    EXECUTE format(
      'CREATE POLICY leitura_apenas_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.pode_escrever_na_empresa(company_id))', t);
  END LOOP;
END $$;

-- Respostas recebidas (quiz e formulários): quem só lê não altera nem apaga. O INSERT
-- fica como está, porque a captura de respostas depende dele.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_submissions','form_submissions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leitura_apenas_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'leitura_apenas_delete', t);
    EXECUTE format(
      'CREATE POLICY leitura_apenas_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.pode_escrever_na_empresa(company_id))
         WITH CHECK (public.pode_escrever_na_empresa(company_id))', t);
    EXECUTE format(
      'CREATE POLICY leitura_apenas_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.pode_escrever_na_empresa(company_id))', t);
  END LOOP;
END $$;
