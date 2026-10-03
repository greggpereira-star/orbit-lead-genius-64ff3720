-- Números reais para a página de Analytics.
--
-- A página mostrava 2.845 leads, 842 qualificados, ROAS 4,8x e CAC de R$ 1.250.
-- Tudo inventado — sobra de template. O número real é 488 leads e nenhum
-- qualificado, porque ninguém move card no funil ainda.
--
-- Painel com número falso é pior que painel vazio: o vazio faz perguntar, o
-- falso faz decidir.

CREATE OR REPLACE FUNCTION public.resumo_analytics(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH regua AS (
    SELECT min(s.order_index) AS corte
    FROM stage_conversion_mappings m
    JOIN stages s ON s.id = m.stage_id
    WHERE m.company_id = p_company_id AND m.is_active
  ),
  periodo AS (
    SELECT l.*, st.order_index
    FROM leads l
    LEFT JOIN stages st ON st.id = l.stage_id
    WHERE l.company_id = p_company_id AND l.created_at >= p_desde
  )
  SELECT jsonb_build_object(
    'leads', (SELECT count(*) FROM periodo),
    'qualificados', CASE WHEN (SELECT corte FROM regua) IS NULL THEN NULL
      ELSE (SELECT count(*) FROM periodo WHERE order_index >= (SELECT corte FROM regua)) END,
    'valor_total', (SELECT coalesce(sum(deal_value), 0) FROM periodo),
    -- Quantos têm identificador de clique: é a medida de saúde do rastreamento,
    -- e sem ela não dá para saber se a atribuição está funcionando.
    'com_identificador', (
      SELECT count(DISTINCT c.lead_id) FROM whatsapp_ad_clicks c
      WHERE c.company_id = p_company_id AND c.lead_id IS NOT NULL
        AND (c.ctwa_clid IS NOT NULL OR c.gclid IS NOT NULL)
    ),
    'tem_regua', (SELECT corte FROM regua) IS NOT NULL,
    'por_origem', coalesce((
      SELECT jsonb_agg(jsonb_build_object('nome', origem, 'valor', total) ORDER BY total DESC)
      FROM (SELECT coalesce(source, '(sem origem)') AS origem, count(*) AS total
            FROM periodo GROUP BY 1) o
    ), '[]'::jsonb),
    'funil', coalesce((
      SELECT jsonb_agg(jsonb_build_object('nome', nome, 'valor', total) ORDER BY ordem)
      FROM (
        SELECT s.name AS nome, s.order_index AS ordem, count(p.id) AS total
        FROM stages s
        LEFT JOIN periodo p ON p.stage_id = s.id
        WHERE s.company_id = p_company_id
        GROUP BY s.name, s.order_index
      ) f
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.resumo_analytics(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumo_analytics(uuid, timestamptz) TO authenticated;
