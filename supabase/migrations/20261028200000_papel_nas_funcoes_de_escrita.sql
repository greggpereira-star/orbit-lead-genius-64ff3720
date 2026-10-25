-- Papel nas funções SECURITY DEFINER que escrevem ou exportam dados.
--
-- Achado em teste ao vivo com uma conta de visualizador: as políticas de RLS já barravam a
-- escrita direta, mas várias funções `SECURITY DEFINER` passam por cima do RLS e só conferiam
-- "ser membro da empresa". Pelo botão "Eliminar dados" o visualizador APAGAVA um lead (e dez
-- tabelas em cascata), e por "Baixar todos os dados" exportava tudo de um lead — ignorando as
-- permissões de excluir e de exportar.
--
-- Aqui a conferência de dentro de cada função passa a olhar o papel:
--   eliminar_dados_do_titular   pode_excluir_lead   (dono/admin; atendente só se a empresa liberou)
--   exportar_dados_do_titular   pode_exportar_dados (idem, pela chave de exportar)
--   demais funções de escrita   pode_escrever_na_empresa (visualizador nunca)
--
-- Cada troca é feita sobre a definição real da função e confirmada: se alguma não mudar como
-- esperado, a migration inteira é abortada (nada fica pela metade).
--
-- NÃO cobre, de propósito: capturas públicas (form_submit_publico, quiz_capture_lead,
-- form_rascunho_salvar, chat_create_lead_from_conversation), gatilhos e funções internas
-- (enfileirar_*, registrar_movimento_de_etapa, pick_next_routing_member...) e
-- get_or_create_company (cadastro). As internas executáveis por `authenticated` são outro
-- assunto (isolamento entre empresas) e ficam para uma revisão própria.

CREATE OR REPLACE FUNCTION public.pode_exportar_dados(p_company_id uuid)
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
               (SELECT p.membros_exportam FROM public.company_permissoes p
                 WHERE p.company_id = p_company_id), false))
       )
  );
$$;
REVOKE ALL ON FUNCTION public.pode_exportar_dados(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_exportar_dados(uuid) TO authenticated, service_role;

DO $$
DECLARE
  r record;
  def text;
  nova text;
  alvo oid;
BEGIN
  -- (função, texto atual, texto novo)
  FOR r IN
    SELECT * FROM (VALUES
      ('eliminar_dados_do_titular', 'check_membership(v_lead.company_id)', 'public.pode_excluir_lead(v_lead.company_id)'),
      ('exportar_dados_do_titular', 'check_membership(v_lead.company_id)', 'public.pode_exportar_dados(v_lead.company_id)'),
      ('definir_motivo_da_perda',   'public.check_membership(v_company)', 'public.pode_escrever_na_empresa(v_company)'),
      ('save_company_pixel_settings','check_membership(p_company_id)',   'public.pode_escrever_na_empresa(p_company_id)'),
      ('quiz_lock_adquirir',        'check_membership(v_company_id)',    'public.pode_escrever_na_empresa(v_company_id)'),
      ('quiz_lock_pedir',           'check_membership(q.company_id)',    'public.pode_escrever_na_empresa(q.company_id)'),
      ('quiz_lock_soltar',          'check_membership(q.company_id)',    'public.pode_escrever_na_empresa(q.company_id)'),
      ('update_form_with_fields',   'public.check_membership_internal(v_company_id, v_user_id)', 'public.pode_escrever_na_empresa(v_company_id)')
    ) AS t(fn, de, para)
  LOOP
    SELECT p.oid INTO alvo FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn;
    IF alvo IS NULL THEN RAISE EXCEPTION 'função % não encontrada', r.fn; END IF;
    def := pg_get_functiondef(alvo);
    IF position(r.de IN def) = 0 THEN RAISE EXCEPTION 'trecho a trocar não encontrado em %', r.fn; END IF;
    nova := replace(def, r.de, r.para);
    EXECUTE nova;
  END LOOP;

  -- Funções de formulário com a conferência "EXISTS em memberships": soma o filtro de papel.
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('create_form_with_fields','save_form_v2','save_form_core_v1',
                         'save_form_builder_v1','save_form_fields_delta_v1','save_form_options_batch_v1')
  LOOP
    def := pg_get_functiondef(r.oid);
    nova := regexp_replace(
      def,
      '(FROM\s+public\.memberships\s+WHERE\s+user_id\s*=\s*v_user_id\s+AND\s+company_id\s*=\s*[a-z_]+)',
      '\1 AND role IN (''owner'', ''admin'', ''member'')',
      'gi');
    IF nova = def THEN RAISE EXCEPTION 'conferência de papel não aplicada em %', r.proname; END IF;
    EXECUTE nova;
  END LOOP;
END $$;
