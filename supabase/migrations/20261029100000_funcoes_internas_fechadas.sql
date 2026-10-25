-- Funções internas fechadas: revisão de segurança das funções SECURITY DEFINER chamáveis de fora.
--
-- Medido em produção (simulação em transação desfeita), antes desta migration:
--   visitante ANÔNIMO   enfileirava automação de qualquer empresa (`enfileirar_automacao`), criava ou
--                       lia empresa (`get_or_create_company`) e perguntava "fulano é membro?"
--                       (`check_membership_internal`);
--   usuário LOGADO SEM VÍNCULO com a empresa lia as métricas dela (`resumo_analytics`: 628 leads;
--                       `relatorio_anuncios`: 15 linhas) e também enfileirava automação.
-- Causa: no Supabase toda função nova nasce executável por `anon` e `authenticated`; as funções
-- `SECURITY DEFINER` passam por cima do RLS e nunca conferiam quem chamava.
--
-- O que muda:
--   1. enfileirar_automacao e check_membership_internal deixam de ser chamáveis por anon/logado.
--      Todos os chamadores de dentro do banco são DEFINER (gatilhos e cron) e seguem funcionando.
--   2. resumo_analytics, relatorio_anuncios, pick_next_routing_member passam a exigir que quem chama
--      seja membro da empresa — ou que seja o servidor (service_role / conexão direta).
--   3. get_or_create_company só aceita o próprio usuário (ou o servidor).
--   4. empresa_do_lead e etiqueta_ja_existe (usadas nas políticas de RLS) só respondem a membros.
--   5. Funções que o visitante anônimo NÃO precisa deixam de ser executáveis por ele. Ficam de fora,
--      por cautela: as públicas por desenho (formulário, rascunho, captura de quiz, pixel, domínio do
--      chat), as citadas em políticas de RLS e as chamadas por outras funções.
--
-- "Ser o servidor" é lido do ajuste `role` da sessão (anon / authenticated / service_role / none),
-- que dentro de uma função SECURITY DEFINER continua refletindo o papel da requisição. Não se usa o
-- JWT: um visitante sem JWT aparece como `anon`, e `auth.role()` seria nulo.

CREATE OR REPLACE FUNCTION public.chamada_de_servidor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('role', true), 'none') IN ('none', 'postgres', 'service_role', 'supabase_admin');
$$;
REVOKE ALL ON FUNCTION public.chamada_de_servidor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chamada_de_servidor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.exigir_acesso_a_empresa(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.chamada_de_servidor() THEN
    RETURN;
  END IF;
  IF p_company_id IS NULL OR NOT public.check_membership(p_company_id) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.exigir_acesso_a_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exigir_acesso_a_empresa(uuid) TO authenticated, service_role;

-- 1. Fechadas por completo para quem vem de fora (o servidor e o banco seguem chamando).
REVOKE ALL ON FUNCTION public.enfileirar_automacao(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_automacao(uuid, text, uuid, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.check_membership_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_membership_internal(uuid, uuid) TO service_role;

-- 4. Usadas pelas políticas de RLS: só respondem a quem é membro da empresa.
CREATE OR REPLACE FUNCTION public.empresa_do_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.company_id FROM public.leads l
   WHERE l.id = p_lead_id
     AND (public.chamada_de_servidor() OR public.check_membership(l.company_id));
$$;

CREATE OR REPLACE FUNCTION public.etiqueta_ja_existe(p_company_id uuid, p_tag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (public.chamada_de_servidor() OR public.check_membership(p_company_id))
     AND EXISTS (
       SELECT 1 FROM public.lead_tags t
         JOIN public.leads l ON l.id = t.lead_id
        WHERE l.company_id = p_company_id
          AND lower(t.tag_name) = lower(p_tag)
     );
$$;

-- 2 e 3. Reforço feito sobre a definição real de cada função, com asserção: se o ponto de
-- inserção não existir, a migration inteira é abortada (nada fica pela metade).
DO $$
DECLARE
  r record;
  def text;
  nova text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('resumo_analytics', 'relatorio_anuncios')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position(E'AS $function$\n' IN def) = 0 THEN RAISE EXCEPTION 'ponto de inserção não encontrado em %', r.proname; END IF;
    nova := replace(def, E'AS $function$\n', E'AS $function$\n  SELECT public.exigir_acesso_a_empresa(p_company_id);\n');
    EXECUTE nova;
  END LOOP;

  SELECT p.oid INTO r FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'pick_next_routing_member';
  def := pg_get_functiondef(r.oid);
  IF position('BEGIN' IN def) = 0 THEN RAISE EXCEPTION 'ponto de inserção não encontrado em pick_next_routing_member'; END IF;
  nova := regexp_replace(def, 'BEGIN',
    E'BEGIN\n  PERFORM public.exigir_acesso_a_empresa((SELECT company_id FROM public.routing_configs WHERE id = p_config_id));', '');
  EXECUTE nova;

  SELECT p.oid INTO r FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_or_create_company';
  def := pg_get_functiondef(r.oid);
  IF position('BEGIN' IN def) = 0 THEN RAISE EXCEPTION 'ponto de inserção não encontrado em get_or_create_company'; END IF;
  nova := regexp_replace(def, 'BEGIN',
    E'BEGIN\n    IF NOT public.chamada_de_servidor() AND p_user_id IS DISTINCT FROM auth.uid() THEN\n      RAISE EXCEPTION ''sem acesso a este usuário'' USING ERRCODE = ''42501'';\n    END IF;', '');
  EXECUTE nova;
END $$;

-- 5. O visitante anônimo deixa de poder executar o que não é dele.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
       AND p.prosecdef
       AND pg_get_function_result(p.oid) <> 'trigger'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       -- públicas por desenho:
       AND p.proname NOT IN ('form_publico', 'form_rascunho_ler', 'form_rascunho_salvar',
                             'form_submit_publico', 'quiz_capture_lead', 'public_pixel_config',
                             'is_chat_domain_allowed', 'check_membership')
       -- citadas em política de RLS:
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy pol
          WHERE (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
                ~ ('\m' || p.proname || '\(')
       )
       -- chamadas por outras funções (rodariam como o papel de quem dispara o gatilho):
       AND NOT EXISTS (
         SELECT 1 FROM pg_proc q
          WHERE q.pronamespace = 'public'::regnamespace AND q.oid <> p.oid AND q.prosrc ~ ('\m' || p.proname || '\(')
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', f.proname, f.args);
  END LOOP;
END $$;
