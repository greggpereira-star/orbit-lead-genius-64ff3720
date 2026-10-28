-- Tempo de primeira resposta.
--
-- O que conta como "resposta": a primeira mensagem de SAÍDA de uma pessoa da equipe
-- (`origin = 'agent'`, ou `'app_echo'`, que é a equipe respondendo pelo app do WhatsApp
-- no celular) depois que o lead chegou. Mensagem de automação NÃO conta: modelo
-- disparado por regra não é alguém falando com o lead, e contá-la zeraria o indicador.
-- Mensagem que falhou ao enviar também não conta.
--
-- O relógio começa no que vier primeiro: a criação do lead ou a primeira mensagem do
-- cliente. Lead de anúncio com formulário nasce antes de qualquer conversa; lead que
-- nasce de uma conversa tem as duas coisas quase no mesmo instante.
--
-- Só há como medir lead que tem conversa no WhatsApp ligada a ele (`wa_conversations.lead_id`).
-- A função devolve também QUANTOS leads têm conversa, para a tela dizer a cobertura em vez
-- de apresentar a mediana como se valesse para todos.
--
-- `esperando_*` é o estado de agora (cliente falou por último e ninguém da equipe
-- respondeu depois), de toda a empresa, e não depende do período.

CREATE OR REPLACE FUNCTION public.tempo_de_resposta(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  leads_total bigint,
  com_conversa bigint,
  respondidos bigint,
  mediana_segundos numeric,
  p90_segundos numeric,
  ate_5min bigint,
  ate_1h bigint,
  ate_24h bigint,
  so_automacao bigint,
  sem_resposta bigint,
  esperando_agora bigint,
  espera_mais_antiga_segundos numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH msgs AS (
    SELECT
      c.lead_id,
      m.direction,
      m.origin,
      m.status,
      coalesce(m.provider_ts, m.created_at) AS quando
    FROM public.wa_conversations c
    JOIN public.wa_messages m ON m.conversation_id = c.id
    JOIN public.leads l ON l.id = c.lead_id
    WHERE c.company_id = p_company_id
      AND l.company_id = p_company_id
      AND l.created_at >= p_desde
  ),
  por_lead AS (
    SELECT
      l.id,
      least(
        l.created_at,
        min(m.quando) FILTER (WHERE m.direction = 'inbound' AND m.origin = 'customer')
      ) AS inicio,
      m_h.primeira_humana,
      bool_or(m.origin = 'automation' AND m.direction = 'outbound' AND m.status <> 'failed') AS houve_automacao
    FROM public.leads l
    JOIN msgs m ON m.lead_id = l.id
    LEFT JOIN LATERAL (
      SELECT min(x.quando) AS primeira_humana
        FROM msgs x
       WHERE x.lead_id = l.id
         AND x.direction = 'outbound'
         AND x.origin IN ('agent', 'app_echo')
         AND x.status <> 'failed'
    ) m_h ON true
    WHERE l.company_id = p_company_id
      AND l.created_at >= p_desde
    GROUP BY l.id, l.created_at, m_h.primeira_humana
  ),
  medido AS (
    SELECT
      id,
      primeira_humana,
      houve_automacao,
      CASE WHEN primeira_humana IS NOT NULL AND primeira_humana >= inicio
           THEN extract(epoch FROM (primeira_humana - inicio)) END AS segundos
    FROM por_lead
  ),
  -- Estado de agora, por conversa: a mensagem mais antiga do cliente que ainda não teve
  -- resposta de alguém da equipe depois dela.
  fila AS (
    SELECT
      c.id,
      (
        SELECT min(coalesce(i.provider_ts, i.created_at))
          FROM public.wa_messages i
         WHERE i.conversation_id = c.id
           AND i.direction = 'inbound'
           AND i.origin = 'customer'
           AND coalesce(i.provider_ts, i.created_at) > coalesce((
                 SELECT max(coalesce(o.provider_ts, o.created_at))
                   FROM public.wa_messages o
                  WHERE o.conversation_id = c.id
                    AND o.direction = 'outbound'
                    AND o.origin IN ('agent', 'app_echo')
                    AND o.status <> 'failed'
               ), '-infinity'::timestamptz)
      ) AS desde_quando
    FROM public.wa_conversations c
    WHERE c.company_id = p_company_id
      AND c.status <> 'resolved'
  )
  SELECT
    (SELECT count(*) FROM public.leads l WHERE l.company_id = p_company_id AND l.created_at >= p_desde),
    (SELECT count(*) FROM medido),
    (SELECT count(*) FROM medido WHERE segundos IS NOT NULL),
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos))::numeric, 0) FROM medido WHERE segundos IS NOT NULL),
    (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY segundos))::numeric, 0) FROM medido WHERE segundos IS NOT NULL),
    (SELECT count(*) FROM medido WHERE segundos <= 300),
    (SELECT count(*) FROM medido WHERE segundos <= 3600),
    (SELECT count(*) FROM medido WHERE segundos <= 86400),
    (SELECT count(*) FROM medido WHERE segundos IS NULL AND houve_automacao),
    (SELECT count(*) FROM medido WHERE segundos IS NULL),
    (SELECT count(*) FROM fila WHERE desde_quando IS NOT NULL),
    (SELECT round(extract(epoch FROM (now() - min(desde_quando)))::numeric, 0) FROM fila WHERE desde_quando IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) TO authenticated, service_role;
