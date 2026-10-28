-- Estatísticas dos links de anúncio: do clique à venda.
--
-- A tela contava cliques e conversas no navegador, com `.in(link_id, …)`: além de
-- limitado a 1.000 linhas pelo PostgREST, parava na conversa. A pergunta que a
-- mídia faz é "este link traz cliente?", e isso exige seguir o clique até o lead
-- e do lead até a etapa em que ele está hoje.
--
-- Funil por link:
--   cliques → conversas (clique casado com um telefone) → leads distintos
--   → qualificados (régua da empresa) → vendas (etapa de ganho) + valor.
--
-- Um lead pode ter clicado duas vezes no mesmo link; ele conta UMA vez em
-- leads/qualificados/vendas, senão a venda e o valor sairiam duplicados.

CREATE OR REPLACE FUNCTION public.estatisticas_dos_links(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  link_id uuid,
  slug text,
  nome text,
  is_active boolean,
  cliques bigint,
  cliques_7d bigint,
  conversas bigint,
  leads bigint,
  qualificados bigint,
  vendas bigint,
  valor_vendas numeric,
  ultimo_clique timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH regua AS (
    SELECT coalesce(
      (SELECT q.order_index FROM stages q WHERE q.company_id = p_company_id AND q.is_qualified_cut),
      min(s.order_index)
    ) AS corte
    FROM stage_conversion_mappings m
    JOIN stages s ON s.id = m.stage_id
    WHERE m.company_id = p_company_id AND m.is_active
  ),
  cliques AS (
    SELECT c.link_id, count(*) AS total,
           count(*) FILTER (WHERE c.clicked_at >= now() - interval '7 days') AS ult7,
           count(*) FILTER (WHERE c.phone IS NOT NULL) AS conversas,
           max(c.clicked_at) AS ultimo
    FROM whatsapp_ad_clicks c
    WHERE c.company_id = p_company_id AND c.link_id IS NOT NULL AND c.clicked_at >= p_desde
    GROUP BY c.link_id
  ),
  leads_do_link AS (
    SELECT DISTINCT c.link_id, l.id AS lead_id,
           st.order_index, st.kind, l.deal_value
    FROM whatsapp_ad_clicks c
    JOIN leads l ON l.id = c.lead_id AND l.company_id = p_company_id
    LEFT JOIN stages st ON st.id = l.stage_id
    WHERE c.company_id = p_company_id AND c.link_id IS NOT NULL AND c.clicked_at >= p_desde
  ),
  funil AS (
    SELECT d.link_id,
           count(*) AS leads,
           count(*) FILTER (
             WHERE d.order_index IS NOT NULL
               AND d.order_index >= (SELECT corte FROM regua)
               AND d.kind <> 'lost'
           ) AS qualificados,
           count(*) FILTER (WHERE d.kind = 'won') AS vendas,
           coalesce(sum(d.deal_value) FILTER (WHERE d.kind = 'won'), 0) AS valor
    FROM leads_do_link d
    GROUP BY d.link_id
  )
  SELECT
    r.id, r.slug, r.nome, r.is_active,
    coalesce(c.total, 0), coalesce(c.ult7, 0), coalesce(c.conversas, 0),
    coalesce(f.leads, 0), coalesce(f.qualificados, 0), coalesce(f.vendas, 0), coalesce(f.valor, 0),
    c.ultimo
  FROM redirect_links r
  LEFT JOIN cliques c ON c.link_id = r.id
  LEFT JOIN funil f ON f.link_id = r.id
  WHERE r.company_id = p_company_id
  ORDER BY coalesce(c.total, 0) DESC, r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.estatisticas_dos_links(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estatisticas_dos_links(uuid, timestamptz) TO authenticated, service_role;

-- Um mesmo link serve a várias campanhas; o que separa uma da outra são as UTMs
-- do clique. Aqui o clique é agrupado por origem para a tela mostrar qual
-- campanha dentro do link está rendendo.
CREATE OR REPLACE FUNCTION public.cliques_do_link_por_origem(
  p_link_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  utm_source text,
  utm_campaign text,
  cliques bigint,
  conversas bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT r.company_id INTO v_empresa FROM redirect_links r WHERE r.id = p_link_id;
  PERFORM public.exigir_acesso_a_empresa(v_empresa);

  RETURN QUERY
  SELECT coalesce(c.utm_source, '(sem origem)'),
         coalesce(c.utm_campaign, '(sem campanha)'),
         count(*)::bigint,
         (count(*) FILTER (WHERE c.phone IS NOT NULL))::bigint
  FROM whatsapp_ad_clicks c
  WHERE c.link_id = p_link_id AND c.company_id = v_empresa AND c.clicked_at >= p_desde
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.cliques_do_link_por_origem(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliques_do_link_por_origem(uuid, timestamptz) TO authenticated, service_role;
