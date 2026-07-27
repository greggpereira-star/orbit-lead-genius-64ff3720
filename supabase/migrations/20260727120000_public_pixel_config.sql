-- Pixel do Meta e conversões do Google Ads nas páginas públicas.
--
-- Duas coisas moram na mesma linha de `integrations` e não podem ter o mesmo
-- destino: o ID do Pixel é público (aparece no HTML de qualquer site que o use)
-- e o access token da Conversions API é segredo. A RLS da tabela exige
-- `check_membership`, então o visitante anônimo não lê nada dali — inclusive o
-- ID do Pixel, de que ele precisa.
--
-- Esta função é a única porta: devolve os identificadores públicos e NUNCA o
-- token. Preferimos isto a afrouxar a RLS da tabela, que exporia o token junto.

-- Uma integração por provedor por empresa. Sem isto, o `upsert` da tela de
-- configurações vira insert e a empresa acumula linhas duplicadas com pixels
-- diferentes — e qual delas vale passa a depender da ordem de leitura.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_company_provider_key
  ON public.integrations (company_id, provider);

CREATE OR REPLACE FUNCTION public.public_pixel_config(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'metaPixelId', (
      SELECT config->>'pixel_id' FROM integrations
       WHERE company_id = p_company_id AND provider = 'meta' AND status = 'connected'
    ),
    'googleConversionId', (
      SELECT config->>'conversion_id' FROM integrations
       WHERE company_id = p_company_id AND provider = 'google_ads' AND status = 'connected'
    ),
    'googleLeadLabel', (
      SELECT config->>'lead_label' FROM integrations
       WHERE company_id = p_company_id AND provider = 'google_ads' AND status = 'connected'
    ),
    'googleCompleteLabel', (
      SELECT config->>'complete_label' FROM integrations
       WHERE company_id = p_company_id AND provider = 'google_ads' AND status = 'connected'
    )
  ));
$$;

REVOKE ALL ON FUNCTION public.public_pixel_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_pixel_config(uuid) TO anon, authenticated;

-- Leitura da tela de configurações.
--
-- Um `select('config')` direto traria o access token para dentro do navegador
-- de todo mundo que abre a tela. Quem digitou o token pode vê-lo de novo — mas
-- não há motivo para ele trafegar a cada carregamento de página. Aqui volta
-- apenas se ESTÁ configurado; para trocar, digita-se outro.
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
BEGIN
  IF NOT check_membership(p_company_id) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa';
  END IF;

  SELECT config INTO v_meta   FROM integrations WHERE company_id = p_company_id AND provider = 'meta';
  SELECT config INTO v_google FROM integrations WHERE company_id = p_company_id AND provider = 'google_ads';

  RETURN jsonb_build_object(
    'metaPixelId',          coalesce(v_meta->>'pixel_id', ''),
    'metaTestEventCode',    coalesce(v_meta->>'test_event_code', ''),
    'metaTokenConfigured',  coalesce(v_meta->>'access_token', '') <> '',
    'googleConversionId',   coalesce(v_google->>'conversion_id', ''),
    'googleLeadLabel',      coalesce(v_google->>'lead_label', ''),
    'googleCompleteLabel',  coalesce(v_google->>'complete_label', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_pixel_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_pixel_settings(uuid) TO authenticated;

-- Gravação.
--
-- `p_meta_access_token` NULL significa "não mexe no token". É o que permite a
-- tela salvar uma mudança de Pixel ID sem obrigar a redigitar o token — e é
-- por isso que a tela nunca precisa carregar o token para depois devolvê-lo.
CREATE OR REPLACE FUNCTION public.save_company_pixel_settings(
  p_company_id uuid,
  p_meta_pixel_id text DEFAULT NULL,
  p_meta_access_token text DEFAULT NULL,
  p_meta_test_event_code text DEFAULT NULL,
  p_google_conversion_id text DEFAULT NULL,
  p_google_lead_label text DEFAULT NULL,
  p_google_complete_label text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta   jsonb;
  v_google jsonb;
BEGIN
  IF NOT check_membership(p_company_id) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa';
  END IF;

  SELECT coalesce(config, '{}'::jsonb) INTO v_meta
    FROM integrations WHERE company_id = p_company_id AND provider = 'meta';
  v_meta := coalesce(v_meta, '{}'::jsonb)
         || jsonb_build_object(
              'pixel_id',        nullif(btrim(coalesce(p_meta_pixel_id, '')), ''),
              'test_event_code', nullif(btrim(coalesce(p_meta_test_event_code, '')), '')
            );
  IF p_meta_access_token IS NOT NULL AND btrim(p_meta_access_token) <> '' THEN
    v_meta := v_meta || jsonb_build_object('access_token', btrim(p_meta_access_token));
  END IF;

  INSERT INTO integrations (company_id, provider, config, status)
  VALUES (p_company_id, 'meta', jsonb_strip_nulls(v_meta),
          CASE WHEN coalesce(v_meta->>'pixel_id', '') = '' THEN 'disconnected' ELSE 'connected' END)
  ON CONFLICT (company_id, provider) DO UPDATE
    SET config = excluded.config, status = excluded.status;

  SELECT coalesce(config, '{}'::jsonb) INTO v_google
    FROM integrations WHERE company_id = p_company_id AND provider = 'google_ads';
  v_google := coalesce(v_google, '{}'::jsonb)
           || jsonb_build_object(
                'conversion_id',  nullif(btrim(coalesce(p_google_conversion_id, '')), ''),
                'lead_label',     nullif(btrim(coalesce(p_google_lead_label, '')), ''),
                'complete_label', nullif(btrim(coalesce(p_google_complete_label, '')), '')
              );

  INSERT INTO integrations (company_id, provider, config, status)
  VALUES (p_company_id, 'google_ads', jsonb_strip_nulls(v_google),
          CASE WHEN coalesce(v_google->>'conversion_id', '') = '' THEN 'disconnected' ELSE 'connected' END)
  ON CONFLICT (company_id, provider) DO UPDATE
    SET config = excluded.config, status = excluded.status;
END;
$$;

REVOKE ALL ON FUNCTION public.save_company_pixel_settings(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_company_pixel_settings(uuid, text, text, text, text, text, text) TO authenticated;
