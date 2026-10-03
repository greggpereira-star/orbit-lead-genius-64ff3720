-- Inteligência de anúncios — Fase 4
--
-- A pergunta que a mídia precisa responder não é "qual anúncio traz conversa",
-- é "qual anúncio traz conversa que VIRA cliente". Dois anúncios com o mesmo
-- custo por conversa podem ter qualidade oposta, e sem este cruzamento a decisão
-- de verba é tomada pelo número errado.
--
-- Função e não view: a régua de "qualificado" depende do mapeamento de etapas de
-- CADA empresa, então o cálculo precisa do company_id como entrada.

CREATE OR REPLACE FUNCTION public.relatorio_anuncios(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '90 days'
)
RETURNS TABLE (
  ad_id text,
  ad_name text,
  campanha text,
  rede text,
  conversas bigint,
  qualificados bigint,
  taxa_qualificacao numeric,
  valor_total numeric,
  dias_ate_qualificar numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH regua AS (
    -- A primeira etapa configurada como conversão é o corte de "qualificado".
    -- Quem passou dela, qualificou — inclusive quem já foi além, porque o lead
    -- que fechou venda obviamente também qualificou.
    SELECT min(s.order_index) AS corte
    FROM stage_conversion_mappings m
    JOIN stages s ON s.id = m.stage_id
    WHERE m.company_id = p_company_id AND m.is_active
  ),
  base AS (
    SELECT
      coalesce(l.metadata->>'meta_ad_id', '(sem anúncio)') AS ad_id,
      coalesce(a.ad_name, l.metadata->>'meta_ad_name', '(sem nome)') AS ad_name,
      coalesce(a.campaign_name, l.utm_campaign, '(sem campanha)') AS campanha,
      coalesce(l.metadata->>'meta_ad_source', l.utm_source, 'meta') AS rede,
      -- `order_index IS NOT NULL` protege lead sem etapa: ele não é qualificado
      -- nem desqualificado, só não está no funil.
      (st.order_index IS NOT NULL AND st.order_index >= (SELECT corte FROM regua)) AS qualificou,
      l.deal_value,
      EXTRACT(EPOCH FROM (coalesce(l.stage_entered_at, l.updated_at) - l.created_at)) / 86400.0 AS dias
    FROM leads l
    LEFT JOIN stages st ON st.id = l.stage_id
    LEFT JOIN meta_ad_attribution a ON a.ad_id = l.metadata->>'meta_ad_id'
    WHERE l.company_id = p_company_id
      AND l.created_at >= p_desde
  )
  SELECT
    b.ad_id,
    b.ad_name,
    b.campanha,
    b.rede,
    count(*) AS conversas,
    count(*) FILTER (WHERE b.qualificou) AS qualificados,
    -- Sem régua configurada a taxa é NULL, e não zero: "ninguém qualificou" e
    -- "não há como saber" são coisas diferentes, e zero mentiria.
    CASE WHEN (SELECT corte FROM regua) IS NULL THEN NULL
         ELSE round(100.0 * count(*) FILTER (WHERE b.qualificou) / nullif(count(*), 0), 1)
    END AS taxa_qualificacao,
    coalesce(sum(b.deal_value) FILTER (WHERE b.qualificou), 0) AS valor_total,
    round(avg(b.dias) FILTER (WHERE b.qualificou)::numeric, 1) AS dias_ate_qualificar
  FROM base b
  GROUP BY b.ad_id, b.ad_name, b.campanha, b.rede
  ORDER BY count(*) FILTER (WHERE b.qualificou) DESC, count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.relatorio_anuncios(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_anuncios(uuid, timestamptz) TO authenticated;
