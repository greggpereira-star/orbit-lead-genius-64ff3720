-- Gasto por anúncio e custo por lead.
--
-- `relatorio_anuncios` diz quantas conversas e quantos qualificados cada anúncio
-- trouxe, mas não o que custou. Sem o gasto, "o anúncio com mais qualificados"
-- e "o anúncio que mais compensa" parecem a mesma pergunta e não são.
--
-- O gasto vem das plataformas (hoje, Meta) e é gravado POR DIA e POR ANÚNCIO:
-- é o grão que a API entrega e o que permite fechar qualquer janela (7, 30, 90
-- dias) sem chamar a plataforma de novo. Reimportar um dia sobrescreve — a Meta
-- revisa o gasto dos últimos dias, então a carga é idempotente por construção.

CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rede           text NOT NULL CHECK (rede IN ('meta', 'google')),
  conta_id       text NOT NULL,
  ad_id          text NOT NULL,
  ad_name        text,
  adset_id       text,
  adset_name     text,
  campaign_id    text,
  campaign_name  text,
  -- Dia no fuso da CONTA de anúncios, como a plataforma informa. Não é UTC.
  dia            date NOT NULL,
  gasto          numeric(14, 2) NOT NULL CHECK (gasto >= 0),
  moeda          text NOT NULL DEFAULT 'BRL',
  impressoes     bigint NOT NULL DEFAULT 0 CHECK (impressoes >= 0),
  cliques        bigint NOT NULL DEFAULT 0 CHECK (cliques >= 0),
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_spend_daily_unico UNIQUE (company_id, rede, ad_id, dia)
);

CREATE INDEX IF NOT EXISTS ad_spend_daily_empresa_dia
  ON public.ad_spend_daily (company_id, dia DESC);

ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;

-- Leitura para quem é da empresa. Escrita só pelo servidor (chave de serviço):
-- um número de gasto editável pelo navegador seria um número em que ninguém
-- poderia confiar.
DROP POLICY IF EXISTS ad_spend_daily_leitura ON public.ad_spend_daily;
CREATE POLICY ad_spend_daily_leitura ON public.ad_spend_daily
  FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

REVOKE ALL ON public.ad_spend_daily FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ad_spend_daily FROM authenticated;
GRANT SELECT ON public.ad_spend_daily TO authenticated;
GRANT ALL ON public.ad_spend_daily TO service_role;

-- Relatório com custo.
--
-- Junta `relatorio_anuncios` (que já aplica o controle de acesso e a régua de
-- "qualificado" da empresa) ao gasto do mesmo período, por anúncio.
--
-- FULL OUTER JOIN de propósito: anúncio que gastou e não trouxe lead nenhum é
-- exatamente o que a mídia mais precisa ver, e um JOIN comum o esconderia.
--
-- Os custos ficam NULL (não zero) quando não dá para calcular: sem gasto
-- importado, "custo zero" diria que o lead saiu de graça.
CREATE OR REPLACE FUNCTION public.relatorio_de_custo(
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
  dias_ate_qualificar numeric,
  gasto numeric,
  impressoes bigint,
  cliques bigint,
  moeda text,
  custo_por_lead numeric,
  custo_por_qualificado numeric,
  roas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH rel AS (
    SELECT * FROM public.relatorio_anuncios(p_company_id, p_desde)
  ),
  gasto AS (
    SELECT
      s.ad_id,
      (array_agg(s.ad_name ORDER BY s.dia DESC))[1] AS ad_name,
      (array_agg(s.campaign_name ORDER BY s.dia DESC))[1] AS campanha,
      sum(s.gasto) AS gasto,
      sum(s.impressoes)::bigint AS impressoes,
      sum(s.cliques)::bigint AS cliques,
      max(s.moeda) AS moeda
    FROM public.ad_spend_daily s
    WHERE s.company_id = p_company_id
      AND s.rede = 'meta'
      -- O corte do relatório de leads é um instante; o gasto é por dia. O dia é
      -- tomado no fuso do negócio para a janela não perder o primeiro dia.
      AND s.dia >= (p_desde AT TIME ZONE 'America/Sao_Paulo')::date
    GROUP BY s.ad_id
  )
  SELECT
    coalesce(r.ad_id, g.ad_id),
    coalesce(r.ad_name, g.ad_name, '(sem nome)'),
    coalesce(r.campanha, g.campanha, '(sem campanha)'),
    coalesce(r.rede, 'meta'),
    coalesce(r.conversas, 0),
    coalesce(r.qualificados, 0),
    r.taxa_qualificacao,
    coalesce(r.valor_total, 0),
    r.dias_ate_qualificar,
    g.gasto,
    g.impressoes,
    g.cliques,
    g.moeda,
    CASE WHEN g.gasto IS NOT NULL AND coalesce(r.conversas, 0) > 0
         THEN round(g.gasto / r.conversas, 2) END,
    CASE WHEN g.gasto IS NOT NULL AND coalesce(r.qualificados, 0) > 0
         THEN round(g.gasto / r.qualificados, 2) END,
    CASE WHEN g.gasto > 0 AND coalesce(r.valor_total, 0) > 0
         THEN round(r.valor_total / g.gasto, 2) END
  FROM rel r
  FULL OUTER JOIN gasto g ON g.ad_id = r.ad_id
  ORDER BY g.gasto DESC NULLS LAST, coalesce(r.conversas, 0) DESC;
$$;

REVOKE ALL ON FUNCTION public.relatorio_de_custo(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_de_custo(uuid, timestamptz) TO authenticated, service_role;
