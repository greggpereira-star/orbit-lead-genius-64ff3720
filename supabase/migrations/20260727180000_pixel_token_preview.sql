-- O campo do token voltava vazio e parecia que nada tinha sido salvo.
--
-- Devolver o token inteiro para a tela resolveria a aparência e criaria o
-- problema: o segredo passaria a trafegar a cada carregamento da página de
-- configurações, para dentro do navegador de qualquer pessoa da equipe que
-- abrisse a tela.
--
-- O meio-termo é mostrar o suficiente para reconhecer QUAL token está gravado,
-- sem entregar o token: as quatro primeiras e as quatro últimas letras, com o
-- miolo coberto. Dá para conferir que é o token certo e não dá para usá-lo.
--
-- O comprimento entra junto porque é o que denuncia um token truncado na
-- colagem — falha comum e silenciosa, já que um token cortado só dá erro na
-- hora de enviar o evento.

CREATE OR REPLACE FUNCTION public.company_pixel_settings(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta   jsonb;
  v_google jsonb;
  v_token  text;
BEGIN
  IF NOT check_membership(p_company_id) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa';
  END IF;

  SELECT config INTO v_meta   FROM integrations WHERE company_id = p_company_id AND provider = 'meta';
  SELECT config INTO v_google FROM integrations WHERE company_id = p_company_id AND provider = 'google_ads';

  v_token := coalesce(v_meta->>'access_token', '');

  RETURN jsonb_build_object(
    'metaPixelId',          coalesce(v_meta->>'pixel_id', ''),
    'metaTestEventCode',    coalesce(v_meta->>'test_event_code', ''),
    'metaTokenConfigured',  v_token <> '',
    'metaTokenPreview',
      CASE
        WHEN v_token = '' THEN ''
        -- Token curto demais para mascarar com folga: cobre tudo. Melhor não
        -- mostrar nada do que entregar metade de um segredo pequeno.
        WHEN length(v_token) < 12 THEN repeat('•', length(v_token))
        ELSE left(v_token, 4) || repeat('•', 10) || right(v_token, 4)
      END,
    'metaTokenLength',      length(v_token),
    'googleConversionId',   coalesce(v_google->>'conversion_id', ''),
    'googleLeadLabel',      coalesce(v_google->>'lead_label', ''),
    'googleCompleteLabel',  coalesce(v_google->>'complete_label', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_pixel_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_pixel_settings(uuid) TO authenticated;
