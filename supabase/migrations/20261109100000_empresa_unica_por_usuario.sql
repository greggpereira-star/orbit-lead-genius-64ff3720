-- Um usuário novo recebe UMA empresa, mesmo com duas chamadas simultâneas.
--
-- MEDIDO em 28/10/2026: o usuário c40d1eb6… tem duas empresas "Taciane Ladislau", criadas com 21 ms
-- de diferença (slugs `…-456` e `…-269`, o formato do código de recuperação de workspace), e dois
-- vínculos de dono criados com 18 ms de diferença. É o único usuário com mais de uma empresa.
--
-- Causa: `get_or_create_company` fazia "tem vínculo? se não, cria a empresa" SEM trava, e a função
-- NÃO criava o vínculo — quem o criava era o navegador, depois. Duas chamadas ao mesmo tempo (duas
-- abas, ou duas execuções do login) enxergavam "sem vínculo", cada uma inseria uma empresa com seu
-- slug aleatório (o ON CONFLICT em `slug` nunca disparava) e cada navegador criava o seu vínculo.
--
-- Agora:
--   * trava por usuário até o fim da transação: a segunda chamada espera a primeira e já enxerga
--     o vínculo que ela criou;
--   * empresa E vínculo de dono nascem na mesma transação (some a janela entre os dois);
--   * o antigo `ON CONFLICT (slug) DO UPDATE SET name` saiu: numa colisão de slug ele RENOMEAVA a
--     empresa existente e devolvia a empresa de outra pessoa. Na colisão agora se tenta outro slug;
--   * a empresa mais antiga do usuário é a devolvida, de forma estável, se houver mais de uma.
-- Não reaproveita empresa "órfã" criada pelo usuário: quem foi removido de uma empresa não pode
-- voltar como dono só por ter sido quem a criou.

CREATE OR REPLACE FUNCTION public.get_or_create_company(p_name text, p_slug text, p_user_id uuid)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company public.companies;
  v_slug    text := p_slug;
  v_tentativa int := 0;
BEGIN
  IF NOT public.chamada_de_servidor() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sem acesso a este usuário' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace:' || p_user_id::text, 0));

  SELECT c.* INTO v_company
    FROM public.companies c
    JOIN public.memberships m ON m.company_id = c.id
   WHERE m.user_id = p_user_id
   ORDER BY m.created_at, c.id
   LIMIT 1;
  IF FOUND THEN
    RETURN v_company;
  END IF;

  LOOP
    BEGIN
      INSERT INTO public.companies (name, slug, created_by)
      VALUES (p_name, v_slug, p_user_id)
      RETURNING * INTO v_company;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_tentativa := v_tentativa + 1;
      IF v_tentativa > 5 THEN
        RAISE;
      END IF;
      v_slug := p_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    END;
  END LOOP;

  INSERT INTO public.memberships (company_id, user_id, role)
  VALUES (v_company.id, p_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_company;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_company(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_company(text, text, uuid) TO authenticated, service_role;
