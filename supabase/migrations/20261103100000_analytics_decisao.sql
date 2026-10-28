-- Analytics: números que não enganam na hora de decidir.
--
-- 1. ROAS de verdade. `relatorio_de_custo.roas` dividia o valor dos leads
--    QUALIFICADOS (pipeline) pelo gasto, mas a tela chamava de "retorno". Retorno é
--    venda: agora vem do valor dos leads em etapa do tipo `won` (ganho). O valor dos
--    qualificados continua na linha, rotulado como pipeline.
-- 2. Funil do período com o que a decisão precisa: tipo da etapa, valor e quantos
--    leads estão parados há mais de 24 h. Em produção 99% dos leads estão na primeira
--    etapa; o funil antigo só mostrava barras, não o gargalo.

-- A assinatura de retorno muda (colunas novas), então não dá para CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.relatorio_de_custo(uuid, timestamptz);

CREATE FUNCTION public.relatorio_de_custo(
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
  roas numeric,
  vendas bigint,
  valor_ganho numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH rel AS (
    -- `rn` numera as linhas do MESMO anúncio: o relatorio_anuncios devolve mais de uma
    -- quando nome, campanha ou rede variam entre os leads, e o gasto (que é por
    -- anúncio) só pode entrar em uma delas — senão o total em dinheiro dobra.
    SELECT r.*,
           row_number() OVER (PARTITION BY r.ad_id ORDER BY r.conversas DESC, r.ad_name, r.campanha, r.rede) AS rn
      FROM public.relatorio_anuncios(p_company_id, p_desde) r
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
      AND s.dia >= (p_desde AT TIME ZONE 'America/Sao_Paulo')::date
    GROUP BY s.ad_id
  ),
  -- Venda = lead hoje em etapa do tipo "ganho", do MESMO grupo de leads do período
  -- (criados desde `p_desde`) que as demais colunas.
  --
  -- O grão TEM de ser o do `relatorio_anuncios` (anúncio + nome + campanha + rede):
  -- ele devolve mais de uma linha para o mesmo `ad_id` quando o nome, a campanha ou a
  -- rede variam, e juntar só por `ad_id` repetiria a venda inteira em cada linha. Por
  -- isso as expressões abaixo são cópia das de `base` naquela função; um ensaio confere
  -- que a soma das linhas é igual ao total real de vendas.
  ganho AS (
    SELECT
      coalesce(l.metadata ->> 'meta_ad_id', '(sem anúncio)') AS ad_id,
      coalesce(a.ad_name, l.metadata ->> 'meta_ad_name', '(sem nome)') AS ad_name,
      coalesce(a.campaign_name, l.utm_campaign, '(sem campanha)') AS campanha,
      coalesce(l.metadata ->> 'meta_ad_source', l.utm_source, 'meta') AS rede,
      count(*) AS vendas,
      coalesce(sum(l.deal_value), 0) AS valor_ganho
    FROM public.leads l
    JOIN public.stages st ON st.id = l.stage_id
    LEFT JOIN public.meta_ad_attribution a ON a.ad_id = l.metadata ->> 'meta_ad_id'
    WHERE l.company_id = p_company_id
      AND l.created_at >= p_desde
      AND st.kind = 'won'
    GROUP BY 1, 2, 3, 4
  )
  -- O gasto mora numa linha só; o retorno dele é a venda do ANÚNCIO inteiro, não só
  -- a das linhas (nome/campanha/rede) que por acaso ficaram sem o gasto.
  , ganho_anuncio AS (
    SELECT ad_id, sum(valor_ganho) AS valor FROM ganho GROUP BY ad_id
  )
  -- Linhas de leads (com o gasto só na primeira de cada anúncio) + anúncios que
  -- gastaram e não trouxeram lead algum: exatamente o que um JOIN comum esconderia.
  , unido AS (
    SELECT r.ad_id, r.ad_name, r.campanha, r.rede, r.conversas, r.qualificados,
           r.taxa_qualificacao, r.valor_total, r.dias_ate_qualificar,
           g.gasto, g.impressoes, g.cliques, g.moeda
      FROM rel r
      LEFT JOIN gasto g ON g.ad_id = r.ad_id AND r.rn = 1
    UNION ALL
    SELECT g.ad_id, coalesce(g.ad_name, '(sem nome)'), coalesce(g.campanha, '(sem campanha)'), 'meta',
           0::bigint, 0::bigint, NULL::numeric, 0::numeric, NULL::numeric,
           g.gasto, g.impressoes, g.cliques, g.moeda
      FROM gasto g
     WHERE NOT EXISTS (SELECT 1 FROM rel r WHERE r.ad_id = g.ad_id)
  )
  SELECT
    u.ad_id,
    u.ad_name,
    u.campanha,
    u.rede,
    u.conversas,
    u.qualificados,
    u.taxa_qualificacao,
    u.valor_total,
    u.dias_ate_qualificar,
    u.gasto,
    u.impressoes,
    u.cliques,
    u.moeda,
    CASE WHEN u.gasto IS NOT NULL AND u.conversas > 0
         THEN round(u.gasto / u.conversas, 2) END,
    CASE WHEN u.gasto IS NOT NULL AND u.qualificados > 0
         THEN round(u.gasto / u.qualificados, 2) END,
    -- ROAS = valor das VENDAS ganhas / gasto. Sem venda com valor, é NULL ("—"), não zero.
    CASE WHEN u.gasto > 0 AND coalesce(wa.valor, 0) > 0
         THEN round(wa.valor / u.gasto, 2) END,
    coalesce(w.vendas, 0),
    coalesce(w.valor_ganho, 0)
  FROM unido u
  LEFT JOIN ganho w
    ON w.ad_id = u.ad_id AND w.ad_name = u.ad_name AND w.campanha = u.campanha AND w.rede = u.rede
  LEFT JOIN ganho_anuncio wa ON wa.ad_id = u.ad_id
  ORDER BY u.gasto DESC NULLS LAST, u.conversas DESC;
$$;

REVOKE ALL ON FUNCTION public.relatorio_de_custo(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_de_custo(uuid, timestamptz) TO authenticated, service_role;

-- Funil do período: uma linha por etapa, na ordem do funil, inclusive as vazias.
CREATE OR REPLACE FUNCTION public.funil_do_periodo(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  stage_id uuid,
  nome text,
  kind text,
  ordem integer,
  leads bigint,
  valor numeric,
  parados_24h bigint,
  horas_medias numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);
  SELECT
    s.id,
    s.name,
    s.kind,
    coalesce(s.order_index, 0),
    count(l.id),
    coalesce(sum(l.deal_value), 0),
    -- "Parado" só faz sentido em etapa aberta: lead ganho ou perdido terminou.
    count(l.id) FILTER (
      WHERE s.kind = 'open'
        AND coalesce(l.stage_entered_at, l.updated_at) < now() - interval '24 hours'
    ),
    round(
      (avg(EXTRACT(EPOCH FROM (now() - coalesce(l.stage_entered_at, l.updated_at))) / 3600.0)
        FILTER (WHERE s.kind = 'open'))::numeric,
      1
    )
  FROM public.stages s
  LEFT JOIN public.leads l
    ON l.stage_id = s.id AND l.company_id = p_company_id AND l.created_at >= p_desde
  WHERE s.company_id = p_company_id
  GROUP BY s.id, s.name, s.kind, s.order_index
  ORDER BY s.order_index, s.created_at;
$$;

REVOKE ALL ON FUNCTION public.funil_do_periodo(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_do_periodo(uuid, timestamptz) TO authenticated, service_role;
