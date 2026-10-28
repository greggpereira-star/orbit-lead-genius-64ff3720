-- Comparativo com o período anterior.
--
-- Devolve DUAS linhas da mesma consulta (mesmo instante, mesma regra): o período
-- atual (de `p_desde` até agora) e o anterior, de MESMA duração, que termina onde o
-- atual começa. Calcular os dois aqui evita o erro clássico de comparar um número
-- feito de um jeito com outro feito de outro.
--
-- Todos os números são por COORTE: leads CRIADOS na janela, vistos na etapa em que
-- estão hoje. Isso tem uma consequência que a tela avisa: o lead do período anterior
-- teve mais tempo para avançar, então qualificados e vendas tendem a favorecê-lo.
--
-- `primeiro_lead` é a data do lead mais antigo da empresa: se ele for posterior ao
-- início do período anterior, a janela anterior está incompleta e a tela não compara.

CREATE OR REPLACE FUNCTION public.comparativo_do_periodo(
  p_company_id uuid,
  p_desde timestamptz,
  p_dias integer
)
RETURNS TABLE (
  periodo text,
  leads bigint,
  qualificados bigint,
  vendas bigint,
  valor_ganho numeric,
  identificados bigint,
  primeiro_lead timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH regua AS (
    -- Mesma régua de `resumo_analytics`: a etapa marcada como corte de qualificação,
    -- ou, sem ela, a menor etapa mapeada como conversão.
    SELECT coalesce(
             (SELECT q.order_index FROM public.stages q WHERE q.company_id = p_company_id AND q.is_qualified_cut),
             min(s.order_index)
           ) AS corte
      FROM public.stage_conversion_mappings m
      JOIN public.stages s ON s.id = m.stage_id
     WHERE m.company_id = p_company_id AND m.is_active
  ),
  janela AS (
    SELECT
      CASE WHEN l.created_at >= p_desde THEN 'atual' ELSE 'anterior' END AS periodo,
      l.id,
      st.order_index,
      st.kind,
      l.deal_value,
      public.canal_do_lead(l) AS canal
    FROM public.leads l
    LEFT JOIN public.stages st ON st.id = l.stage_id
    WHERE l.company_id = p_company_id
      AND l.created_at >= p_desde - make_interval(days => p_dias)
  )
  SELECT
    p.periodo,
    count(j.id),
    CASE WHEN (SELECT corte FROM regua) IS NULL THEN NULL
         ELSE count(j.id) FILTER (WHERE j.order_index >= (SELECT corte FROM regua)) END,
    count(j.id) FILTER (WHERE j.kind = 'won'),
    coalesce(sum(j.deal_value) FILTER (WHERE j.kind = 'won'), 0),
    count(j.id) FILTER (WHERE j.canal <> 'nao_rastreado'),
    (SELECT min(created_at) FROM public.leads WHERE company_id = p_company_id)
  FROM (VALUES ('atual'), ('anterior')) p(periodo)
  LEFT JOIN janela j ON j.periodo = p.periodo
  GROUP BY p.periodo
  ORDER BY p.periodo;
$$;

REVOKE ALL ON FUNCTION public.comparativo_do_periodo(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comparativo_do_periodo(uuid, timestamptz, integer) TO authenticated, service_role;
