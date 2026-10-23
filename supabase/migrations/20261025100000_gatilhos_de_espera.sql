-- Gatilhos de espera: "conversa pendente" e "cliente sem nova mensagem", e a opção de contar a
-- espera SÓ no horário de atendimento.
--
--   conversation_pending   a conversa está em "pendente" há X minutos (esqueceram dela)
--   customer_silent        a ÚLTIMA mensagem da conversa é nossa (atendente, celular ou automação) e o
--                          cliente não respondeu há X minutos: o gatilho de recuperação de venda
--   customer_no_reply      (já existia) ganha a opção `horario_comercial`
--
-- `trigger_config.horario_comercial = true` faz os três contarem os minutos só dentro do horário de
-- atendimento (Configurações → Horário de atendimento), sem a noite, o fim de semana e os feriados.
-- Desligado (o padrão, e o que já estava decidido), contam em horário corrido. Sem horário
-- configurado, "horário de atendimento" = sempre aberto, então a opção não muda nada.
--
-- Mesma mecânica dos gatilhos por tempo: dispara entre X e X + 120 minutos de espera, uma vez por
-- episódio (a chave de dedup traz o instante em que a espera começou).

-- 1. Desde quando a conversa está no status atual (para "pendente há X") ---------------------------
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.wa_conversations_marca_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_conversations_status_changed_at ON public.wa_conversations;
CREATE TRIGGER wa_conversations_status_changed_at
  BEFORE UPDATE OF status ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.wa_conversations_marca_status();

-- 2. Vocabulário e validação (pelo NOME das constraints) -----------------------------------------------
ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_trigger_event_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_trigger_event_check CHECK (trigger_event IN (
    'lead_created',
    'stage_changed',
    'form_abandoned',
    'whatsapp_message_received',
    'tag_added',
    'customer_no_reply',
    'window_expiring',
    'conversation_resolved',
    'conversation_assigned',
    'conversation_pending',
    'customer_silent'
  ));

ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_minutos_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_minutos_check CHECK (
    (
      trigger_event NOT IN ('customer_no_reply', 'window_expiring', 'conversation_pending', 'customer_silent')
      OR CASE
           WHEN (trigger_config ->> 'minutos') ~ '^[0-9]{1,4}$'
             THEN (trigger_config ->> 'minutos')::int BETWEEN 5 AND 1380
           ELSE false
         END
    )
    -- `horario_comercial`, quando existe, é verdadeiro/falso (um "sim" digitado quebraria a varredura).
    AND ((trigger_config ->> 'horario_comercial') IS NULL
         OR (trigger_config ->> 'horario_comercial') IN ('true', 'false'))
  );

-- 3. Minutos de atendimento entre dois instantes -----------------------------------------------------------
-- Soma, dia a dia, só o que cai dentro do expediente (sem feriado). Sem horário ligado devolve os
-- minutos corridos. Olha no máximo 14 dias: espera maior que isso já é outro problema.
CREATE OR REPLACE FUNCTION public.minutos_uteis(p_company_id uuid, p_de timestamptz, p_ate timestamptz)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg public.company_business_hours%ROWTYPE;
  v_de timestamp;
  v_ate timestamp;
  v_dia date;
  v_horas jsonb;
  v_ini timestamp;
  v_fim timestamp;
  v_total integer := 0;
BEGIN
  IF p_ate <= p_de THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_cfg FROM public.company_business_hours WHERE company_id = p_company_id;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN floor(extract(epoch FROM (p_ate - p_de)) / 60)::int;
  END IF;

  v_de := p_de AT TIME ZONE v_cfg.timezone;
  v_ate := p_ate AT TIME ZONE v_cfg.timezone;

  FOR v_dia IN
    SELECT d::date FROM generate_series(v_de::date, least(v_ate::date, v_de::date + 14), interval '1 day') d
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.company_holidays h
                           WHERE h.company_id = p_company_id AND h.day = v_dia);
    v_horas := v_cfg.schedule -> (extract(dow FROM v_dia)::int)::text;
    CONTINUE WHEN v_horas IS NULL OR v_horas = 'null'::jsonb;

    v_ini := greatest(v_dia + (v_horas ->> 'abre')::time, v_de);
    v_fim := least(v_dia + (v_horas ->> 'fecha')::time, v_ate);
    IF v_fim > v_ini THEN
      v_total := v_total + floor(extract(epoch FROM (v_fim - v_ini)) / 60)::int;
    END IF;
  END LOOP;
  RETURN v_total;
EXCEPTION WHEN OTHERS THEN
  -- Horário malformado não pode derrubar a varredura: cai nos minutos corridos.
  RETURN floor(extract(epoch FROM (p_ate - p_de)) / 60)::int;
END;
$$;
GRANT EXECUTE ON FUNCTION public.minutos_uteis(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- 4. A varredura, agora com os quatro gatilhos de espera (definição anterior + os dois novos + horário) ----
CREATE OR REPLACE FUNCTION public.varrer_gatilhos_de_tempo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_espera int := 0;
  v_janela int := 0;
  v_silencio int := 0;
  v_pendente int := 0;
BEGIN
  -- Cliente sem resposta --------------------------------------------------------------------
  WITH base AS (
    SELECT
      r.id AS rule_id, r.company_id, r.conditions,
      (r.trigger_config ->> 'minutos')::int AS minutos,
      coalesce((r.trigger_config ->> 'horario_comercial')::boolean, false) AS hc,
      c.id AS conversa_id, c.assigned_to, c.origin,
      ct.wa_id, ct.profile_name,
      l.id AS lead_id, l.name AS lead_nome, l.email, l.score, l.temperature, l.source,
      s.name AS etapa,
      c.last_inbound_at AS desde
    FROM public.automation_rules r
    JOIN public.wa_conversations c ON c.company_id = r.company_id
    JOIN public.wa_contacts ct ON ct.id = c.contact_id
    LEFT JOIN public.leads l ON l.id = coalesce(c.lead_id, ct.lead_id)
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE r.trigger_event = 'customer_no_reply'
      AND r.is_active
      AND EXISTS (SELECT 1 FROM public.automation_actions a WHERE a.rule_id = r.id)
      AND c.status <> 'resolved'
      AND ct.opted_out_at IS NULL
      AND c.last_inbound_at IS NOT NULL
      -- Horário corrido: só a janela de 24h (25 h de folga). Horário de atendimento: a espera pode
      -- atravessar a noite e o fim de semana, então olha até 8 dias para trás.
      AND c.last_inbound_at > now() - CASE WHEN coalesce((r.trigger_config ->> 'horario_comercial')::boolean, false)
                                           THEN interval '8 days' ELSE interval '25 hours' END
      -- Nenhuma resposta HUMANA depois da última mensagem do cliente.
      AND NOT EXISTS (
        SELECT 1 FROM public.wa_messages m
         WHERE m.conversation_id = c.id
           AND m.direction = 'outbound'
           AND m.origin IN ('agent', 'app_echo')
           AND coalesce(m.provider_ts, m.created_at) > c.last_inbound_at
      )
      AND (SELECT count(*) FROM public.automation_jobs j
            WHERE j.company_id = r.company_id AND j.status = 'pending') < 500
  ), medido AS (
    SELECT b.*,
           CASE WHEN b.hc THEN public.minutos_uteis(b.company_id, b.desde, now())
                ELSE floor(extract(epoch FROM (now() - b.desde)) / 60)::int END AS espera
      FROM base b
  ), pronto AS (
    SELECT m.*, jsonb_build_object(
      'lead_id', m.lead_id,
      'conversation_id', m.conversa_id,
      'wa_id', m.wa_id,
      'telefone', m.wa_id,
      'nome', coalesce(nullif(btrim(m.lead_nome), ''), m.profile_name),
      'email', m.email,
      'score', m.score,
      'temperatura', m.temperature,
      'origem', m.source,
      'etapa', m.etapa,
      'responsavel_id', m.assigned_to,
      'veio_de_anuncio', CASE WHEN m.origin IS NULL THEN 'false' ELSE 'true' END,
      'dentro_do_horario', CASE WHEN public.dentro_do_horario(m.company_id) THEN 'true' ELSE 'false' END,
      'minutos_esperando', m.espera
    ) AS payload
    FROM medido m
   -- Faixa de tolerância: dispara entre X e X + 120 min de espera (contados como a regra pede).
   WHERE m.espera >= m.minutos AND m.espera < m.minutos + 120
  ), ins AS (
    INSERT INTO public.automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
    SELECT p.company_id, p.rule_id, 'customer_no_reply', p.lead_id, p.payload,
           p.rule_id::text || ':' || p.conversa_id::text || ':espera:'
             || extract(epoch FROM p.desde)::bigint::text
      FROM pronto p
     WHERE public.automacao_condicoes_passam(p.conditions, p.payload)
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_espera FROM ins;

  -- Janela de 24h expirando --------------------------------------------------------------------
  WITH base AS (
    SELECT
      r.id AS rule_id, r.company_id, r.conditions,
      c.id AS conversa_id, c.last_inbound_at, c.assigned_to, c.origin,
      ct.wa_id, ct.profile_name,
      l.id AS lead_id, l.name AS lead_nome, l.email, l.score, l.temperature, l.source,
      s.name AS etapa,
      floor(extract(epoch FROM (c.last_inbound_at + interval '24 hours' - now())) / 60)::int AS restante
    FROM public.automation_rules r
    JOIN public.wa_conversations c ON c.company_id = r.company_id
    JOIN public.wa_contacts ct ON ct.id = c.contact_id
    LEFT JOIN public.leads l ON l.id = coalesce(c.lead_id, ct.lead_id)
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE r.trigger_event = 'window_expiring'
      AND r.is_active
      AND EXISTS (SELECT 1 FROM public.automation_actions a WHERE a.rule_id = r.id)
      AND c.status <> 'resolved'
      AND c.last_inbound_at IS NOT NULL
      AND ct.opted_out_at IS NULL
      -- Ainda aberta, e faltando X minutos ou menos.
      AND c.last_inbound_at + interval '24 hours' > now()
      AND c.last_inbound_at + interval '24 hours'
            <= now() + make_interval(mins => (r.trigger_config ->> 'minutos')::int)
      AND (SELECT count(*) FROM public.automation_jobs j
            WHERE j.company_id = r.company_id AND j.status = 'pending') < 500
  ), pronto AS (
    SELECT b.*, jsonb_build_object(
      'lead_id', b.lead_id,
      'conversation_id', b.conversa_id,
      'wa_id', b.wa_id,
      'telefone', b.wa_id,
      'nome', coalesce(nullif(btrim(b.lead_nome), ''), b.profile_name),
      'email', b.email,
      'score', b.score,
      'temperatura', b.temperature,
      'origem', b.source,
      'etapa', b.etapa,
      'responsavel_id', b.assigned_to,
      'veio_de_anuncio', CASE WHEN b.origin IS NULL THEN 'false' ELSE 'true' END,
      'dentro_do_horario', CASE WHEN public.dentro_do_horario(b.company_id) THEN 'true' ELSE 'false' END,
      'minutos_restantes', b.restante
    ) AS payload
    FROM base b
  ), ins AS (
    INSERT INTO public.automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
    SELECT p.company_id, p.rule_id, 'window_expiring', p.lead_id, p.payload,
           p.rule_id::text || ':' || p.conversa_id::text || ':janela:'
             || extract(epoch FROM p.last_inbound_at)::bigint::text
      FROM pronto p
     WHERE public.automacao_condicoes_passam(p.conditions, p.payload)
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_janela FROM ins;

  -- Cliente em silêncio (sem nova mensagem) -------------------------------------------------
  WITH base AS (
    SELECT
      r.id AS rule_id, r.company_id, r.conditions,
      (r.trigger_config ->> 'minutos')::int AS minutos,
      coalesce((r.trigger_config ->> 'horario_comercial')::boolean, false) AS hc,
      c.id AS conversa_id, c.assigned_to, c.origin,
      ct.wa_id, ct.profile_name,
      l.id AS lead_id, l.name AS lead_nome, l.email, l.score, l.temperature, l.source,
      s.name AS etapa,
      lm.ts AS desde
    FROM public.automation_rules r
    JOIN public.wa_conversations c ON c.company_id = r.company_id
    JOIN public.wa_contacts ct ON ct.id = c.contact_id
    LEFT JOIN public.leads l ON l.id = coalesce(c.lead_id, ct.lead_id)
    LEFT JOIN public.stages s ON s.id = l.stage_id
    -- A ÚLTIMA mensagem da conversa (dos dois lados): se for nossa, o cliente está em silêncio.
    JOIN LATERAL (
      SELECT m.direction, m.origin, coalesce(m.provider_ts, m.created_at) AS ts
        FROM public.wa_messages m
       WHERE m.conversation_id = c.id
       ORDER BY coalesce(m.provider_ts, m.created_at) DESC, m.id DESC
       LIMIT 1
    ) lm ON true
    WHERE r.trigger_event = 'customer_silent'
      AND r.is_active
      AND EXISTS (SELECT 1 FROM public.automation_actions a WHERE a.rule_id = r.id)
      AND c.status <> 'resolved'
      AND ct.opted_out_at IS NULL
      AND lm.direction = 'outbound'
      AND lm.origin IN ('agent', 'app_echo', 'automation')
      AND lm.ts > now() - CASE WHEN coalesce((r.trigger_config ->> 'horario_comercial')::boolean, false)
                               THEN interval '10 days' ELSE interval '3 days' END
      AND (SELECT count(*) FROM public.automation_jobs j
            WHERE j.company_id = r.company_id AND j.status = 'pending') < 500
  ), medido AS (
    SELECT b.*,
           CASE WHEN b.hc THEN public.minutos_uteis(b.company_id, b.desde, now())
                ELSE floor(extract(epoch FROM (now() - b.desde)) / 60)::int END AS espera
      FROM base b
  ), pronto AS (
    SELECT m.*, jsonb_build_object(
      'lead_id', m.lead_id,
      'conversation_id', m.conversa_id,
      'wa_id', m.wa_id,
      'telefone', m.wa_id,
      'nome', coalesce(nullif(btrim(m.lead_nome), ''), m.profile_name),
      'email', m.email,
      'score', m.score,
      'temperatura', m.temperature,
      'origem', m.source,
      'etapa', m.etapa,
      'responsavel_id', m.assigned_to,
      'veio_de_anuncio', CASE WHEN m.origin IS NULL THEN 'false' ELSE 'true' END,
      'dentro_do_horario', CASE WHEN public.dentro_do_horario(m.company_id) THEN 'true' ELSE 'false' END,
      'minutos_sem_mensagem', m.espera
    ) AS payload
    FROM medido m
   -- Faixa de tolerância: dispara entre X e X + 120 min de espera (contados como a regra pede).
   WHERE m.espera >= m.minutos AND m.espera < m.minutos + 120
  ), ins AS (
    INSERT INTO public.automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
    SELECT p.company_id, p.rule_id, 'customer_silent', p.lead_id, p.payload,
           p.rule_id::text || ':' || p.conversa_id::text || ':silencio:'
             || extract(epoch FROM p.desde)::bigint::text
      FROM pronto p
     WHERE public.automacao_condicoes_passam(p.conditions, p.payload)
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_silencio FROM ins;

  -- Conversa pendente -----------------------------------------------------------------------
  WITH base AS (
    SELECT
      r.id AS rule_id, r.company_id, r.conditions,
      (r.trigger_config ->> 'minutos')::int AS minutos,
      coalesce((r.trigger_config ->> 'horario_comercial')::boolean, false) AS hc,
      c.id AS conversa_id, c.assigned_to, c.origin,
      ct.wa_id, ct.profile_name,
      l.id AS lead_id, l.name AS lead_nome, l.email, l.score, l.temperature, l.source,
      s.name AS etapa,
      coalesce(c.status_changed_at, c.last_message_at, c.created_at) AS desde
    FROM public.automation_rules r
    JOIN public.wa_conversations c ON c.company_id = r.company_id
    JOIN public.wa_contacts ct ON ct.id = c.contact_id
    LEFT JOIN public.leads l ON l.id = coalesce(c.lead_id, ct.lead_id)
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE r.trigger_event = 'conversation_pending'
      AND r.is_active
      AND EXISTS (SELECT 1 FROM public.automation_actions a WHERE a.rule_id = r.id)
      AND c.status = 'pending'
      AND ct.opted_out_at IS NULL
      AND coalesce(c.status_changed_at, c.last_message_at, c.created_at) > now() - interval '10 days'
      AND (SELECT count(*) FROM public.automation_jobs j
            WHERE j.company_id = r.company_id AND j.status = 'pending') < 500
  ), medido AS (
    SELECT b.*,
           CASE WHEN b.hc THEN public.minutos_uteis(b.company_id, b.desde, now())
                ELSE floor(extract(epoch FROM (now() - b.desde)) / 60)::int END AS espera
      FROM base b
  ), pronto AS (
    SELECT m.*, jsonb_build_object(
      'lead_id', m.lead_id,
      'conversation_id', m.conversa_id,
      'wa_id', m.wa_id,
      'telefone', m.wa_id,
      'nome', coalesce(nullif(btrim(m.lead_nome), ''), m.profile_name),
      'email', m.email,
      'score', m.score,
      'temperatura', m.temperature,
      'origem', m.source,
      'etapa', m.etapa,
      'responsavel_id', m.assigned_to,
      'veio_de_anuncio', CASE WHEN m.origin IS NULL THEN 'false' ELSE 'true' END,
      'dentro_do_horario', CASE WHEN public.dentro_do_horario(m.company_id) THEN 'true' ELSE 'false' END,
      'minutos_pendente', m.espera
    ) AS payload
    FROM medido m
   -- Faixa de tolerância: dispara entre X e X + 120 min de espera (contados como a regra pede).
   WHERE m.espera >= m.minutos AND m.espera < m.minutos + 120
  ), ins AS (
    INSERT INTO public.automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
    SELECT p.company_id, p.rule_id, 'conversation_pending', p.lead_id, p.payload,
           p.rule_id::text || ':' || p.conversa_id::text || ':pendente:'
             || extract(epoch FROM p.desde)::bigint::text
      FROM pronto p
     WHERE public.automacao_condicoes_passam(p.conditions, p.payload)
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_pendente FROM ins;

  RETURN jsonb_build_object(
    'sem_resposta', v_espera, 'janela_expirando', v_janela,
    'sem_nova_mensagem', v_silencio, 'conversa_pendente', v_pendente
  );
EXCEPTION WHEN OTHERS THEN
  -- Acessório: uma falha na varredura não pode derrubar o agendador.
  RAISE WARNING 'varrer_gatilhos_de_tempo falhou: %', sqlerrm;
  RETURN jsonb_build_object('erro', sqlerrm);
END;
$$;

REVOKE ALL ON FUNCTION public.varrer_gatilhos_de_tempo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.varrer_gatilhos_de_tempo() TO service_role;
