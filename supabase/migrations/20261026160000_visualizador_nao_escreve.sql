-- Visualizador (memberships.role = 'viewer') só lê.
--
-- Medido em produção: 35 tabelas tinham política de escrita por `check_membership`
-- (qualquer linha em `memberships`), então o visualizador criava e editava lead,
-- mexia em integrações, roteamento, formulários, quiz e etapas.
--
-- Em vez de reescrever as dezenas de políticas existentes, soma-se uma política
-- RESTRITIVA por comando: ela é combinada com E às permissivas, então só barra —
-- nunca concede. Dono, administrador e atendente (`member`) continuam passando
-- pelas políticas de antes, sem mudança.
--
-- Fora desta migration, de propósito: `audit_logs`, `lead_events`, `chat_*`,
-- `quiz_events`, `quiz_submissions` e `quiz_edit_locks` — o app grava nelas em
-- nome de quem apenas navega (trilha, tempo real, trava de edição) e barrar o
-- visualizador ali quebraria telas de leitura. `companies` e `memberships` ficam
-- como estão (fluxo de cadastro).

CREATE OR REPLACE FUNCTION public.pode_escrever_na_empresa(p_company_id uuid)
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
       AND m.role IN ('owner', 'admin', 'member')
  );
$$;
REVOKE ALL ON FUNCTION public.pode_escrever_na_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_escrever_na_empresa(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cvcrm_dead_letter_queue','cvcrm_field_mappings','cvcrm_integrations','cvcrm_sync_queue',
    'form_field_options','form_fields','form_steps','forms',
    'google_assets','integration_webhooks','integrations',
    'lead_attachments','lead_notes','leads','loss_reasons',
    'meta_assets','meta_lead_forms','oauth_connections',
    'quiz_funnels','quiz_media','quiz_versions',
    'redirect_links','routing_configs','routing_members',
    'stage_conversion_mappings','stages','whatsapp_capi_dlq'
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
