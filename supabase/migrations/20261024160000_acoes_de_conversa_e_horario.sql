-- Ações de conversa (resolver, reabrir, avaliar atendimento) e horário de atendimento com feriados.
--
-- 1. Ações novas do motor: `resolver_conversa`, `reabrir_conversa`, `avaliar_atendimento`.
--    A avaliação pede uma nota de 1 a 5 por mensagem de texto e grava a resposta em
--    `wa_conversations.csat_*`. Só vale a PRIMEIRA nota em até 48 h do pedido.
-- 2. Horário de atendimento: dias e horas por empresa, mais feriados. `dentro_do_horario(empresa)`
--    diz se agora (ou num instante dado) a empresa atende. SEM horário configurado a resposta é
--    "sim": quem nunca configurou não passa a ser tratado como "fechado" de um dia para o outro.
--    O campo `dentro_do_horario` ('true'/'false') entra em TODO evento de automação, para a regra
--    poder usar como condição ("mensagem recebida fora do horário → avisar que voltamos às 8h").

-- 1. Vocabulário de ações (pelo nome) --------------------------------------------------------------
ALTER TABLE public.automation_actions DROP CONSTRAINT IF EXISTS automation_actions_action_type_check;
ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (action_type IN (
    'etiquetar',
    'mover_etapa',
    'atribuir_responsavel',
    'enviar_whatsapp',
    'webhook',
    'enviar_template',
    'atribuir_conversa',
    'notificar_equipe',
    'resolver_conversa',
    'reabrir_conversa',
    'avaliar_atendimento'
  ));

-- 2. Avaliação do atendimento ----------------------------------------------------------------------
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS csat_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS csat_score smallint CHECK (csat_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS csat_at timestamptz;

-- 3. Horário de atendimento e feriados ---------------------------------------------------------------
-- `schedule`: { "0": {"abre":"08:00","fecha":"18:00"}, ... } com a chave = dia da semana (0 = domingo).
-- Dia ausente = fechado. Um intervalo por dia: almoço fica para uma versão futura.
CREATE TABLE IF NOT EXISTS public.company_business_hours (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day date NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, day)
);

ALTER TABLE public.company_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_business_hours_leitura ON public.company_business_hours;
CREATE POLICY company_business_hours_leitura ON public.company_business_hours
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
DROP POLICY IF EXISTS company_holidays_leitura ON public.company_holidays;
CREATE POLICY company_holidays_leitura ON public.company_holidays
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

-- Escrever: quem administra (owner/admin). Atendente lê, não muda o horário da empresa.
DROP POLICY IF EXISTS company_business_hours_escrita ON public.company_business_hours;
CREATE POLICY company_business_hours_escrita ON public.company_business_hours
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.company_id = company_business_hours.company_id
                    AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m
                       WHERE m.company_id = company_business_hours.company_id
                         AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));
DROP POLICY IF EXISTS company_holidays_escrita ON public.company_holidays;
CREATE POLICY company_holidays_escrita ON public.company_holidays
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.company_id = company_holidays.company_id
                    AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m
                       WHERE m.company_id = company_holidays.company_id
                         AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));

REVOKE ALL ON public.company_business_hours, public.company_holidays FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_business_hours, public.company_holidays TO authenticated;
GRANT ALL ON public.company_business_hours, public.company_holidays TO service_role;

-- A empresa atende em `p_ts`? Sem horário ligado: sim. Feriado: não. Senão, pelo dia da semana e
-- pela hora LOCAL (no fuso da empresa). Fecha às `fecha` em ponto (intervalo [abre, fecha)).
CREATE OR REPLACE FUNCTION public.dentro_do_horario(p_company_id uuid, p_ts timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg public.company_business_hours%ROWTYPE;
  v_local timestamp;
  v_dia jsonb;
  v_abre time;
  v_fecha time;
BEGIN
  SELECT * INTO v_cfg FROM public.company_business_hours WHERE company_id = p_company_id;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN true;
  END IF;

  v_local := p_ts AT TIME ZONE v_cfg.timezone;

  IF EXISTS (SELECT 1 FROM public.company_holidays h
              WHERE h.company_id = p_company_id AND h.day = v_local::date) THEN
    RETURN false;
  END IF;

  v_dia := v_cfg.schedule -> (extract(dow FROM v_local)::int)::text;
  IF v_dia IS NULL OR v_dia = 'null'::jsonb THEN
    RETURN false;
  END IF;

  v_abre := (v_dia ->> 'abre')::time;
  v_fecha := (v_dia ->> 'fecha')::time;
  IF v_abre IS NULL OR v_fecha IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_local::time >= v_abre AND v_local::time < v_fecha;
EXCEPTION WHEN OTHERS THEN
  -- Horário malformado não pode derrubar o enfileiramento: na dúvida, "dentro".
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dentro_do_horario(uuid, timestamptz) TO authenticated, service_role;

-- 4. O campo entra em todo evento (definição vigente de `enfileirar_automacao` + `dentro_do_horario`) ---
create or replace function public.enfileirar_automacao(
  p_company_id uuid,
  p_evento text,
  p_lead_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_sufixo_dedup text default ''
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inseridos int := 0;
  -- Todo evento carrega se a empresa estava dentro do horário de atendimento naquele instante:
  -- "mensagem recebida" + "dentro_do_horario é false" vira a resposta de "estamos fora do horário".
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
         'dentro_do_horario',
         CASE WHEN public.dentro_do_horario(p_company_id) THEN 'true' ELSE 'false' END
       );
begin
  insert into automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
  select
    r.company_id, r.id, p_evento, p_lead_id, v_payload,
    r.id::text || ':' || coalesce(p_lead_id::text, 'sem-lead') || ':' || coalesce(p_sufixo_dedup, '')
  from automation_rules r
  where r.company_id = p_company_id
    and r.trigger_event = p_evento
    and r.is_active
    -- A regra sem ação nenhuma não é enfileirada: rodaria para não fazer nada.
    and exists (select 1 from automation_actions a where a.rule_id = r.id)
    and automacao_condicoes_passam(r.conditions, v_payload)
  on conflict (dedup_key) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

-- A varredura dos gatilhos por tempo monta o próprio payload: o campo entra nela também.
CREATE OR REPLACE FUNCTION public.varrer_gatilhos_de_tempo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_espera int := 0;
  v_janela int := 0;
BEGIN
  -- Cliente sem resposta -----------------------------------------------------------------------
  WITH base AS (
    SELECT
      r.id AS rule_id, r.company_id, r.conditions,
      (r.trigger_config ->> 'minutos')::int AS minutos,
      c.id AS conversa_id, c.last_inbound_at, c.assigned_to, c.origin,
      ct.wa_id, ct.profile_name,
      l.id AS lead_id, l.name AS lead_nome, l.email, l.score, l.temperature, l.source,
      s.name AS etapa
    FROM public.automation_rules r
    JOIN public.wa_conversations c ON c.company_id = r.company_id
    JOIN public.wa_contacts ct ON ct.id = c.contact_id
    LEFT JOIN public.leads l ON l.id = coalesce(c.lead_id, ct.lead_id)
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE r.trigger_event = 'customer_no_reply'
      AND r.is_active
      AND EXISTS (SELECT 1 FROM public.automation_actions a WHERE a.rule_id = r.id)
      AND c.status <> 'resolved'
      AND c.last_inbound_at IS NOT NULL
      AND c.last_inbound_at > now() - interval '25 hours'
      AND ct.opted_out_at IS NULL
      AND c.last_inbound_at <= now() - make_interval(mins => (r.trigger_config ->> 'minutos')::int)
      AND c.last_inbound_at >  now() - make_interval(mins => (r.trigger_config ->> 'minutos')::int + 120)
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
      'minutos_esperando', floor(extract(epoch FROM (now() - b.last_inbound_at)) / 60)::int
    ) AS payload
    FROM base b
  ), ins AS (
    INSERT INTO public.automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
    SELECT p.company_id, p.rule_id, 'customer_no_reply', p.lead_id, p.payload,
           p.rule_id::text || ':' || p.conversa_id::text || ':espera:'
             || extract(epoch FROM p.last_inbound_at)::bigint::text
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

  RETURN jsonb_build_object('sem_resposta', v_espera, 'janela_expirando', v_janela);
EXCEPTION WHEN OTHERS THEN
  -- Acessório: uma falha na varredura não pode derrubar o agendador.
  RAISE WARNING 'varrer_gatilhos_de_tempo falhou: %', sqlerrm;
  RETURN jsonb_build_object('erro', sqlerrm);
END;
$$;

-- 5. Resposta de pesquisa não dispara automação (definição vigente do gatilho de mensagem + guarda) -----
CREATE OR REPLACE FUNCTION public.wa_disparar_automacao_de_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conv public.wa_conversations%ROWTYPE;
  v_contato public.wa_contacts%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_lead_id uuid;
  v_primeira boolean;
BEGIN
  BEGIN
    SELECT * INTO v_conv FROM public.wa_conversations WHERE id = NEW.conversation_id;
    SELECT * INTO v_contato FROM public.wa_contacts WHERE id = v_conv.contact_id;
    v_lead_id := coalesce(v_conv.lead_id, v_contato.lead_id);
    IF v_lead_id IS NOT NULL THEN
      SELECT * INTO v_lead FROM public.leads WHERE id = v_lead_id;
    END IF;

    -- Pedido de parada ("SAIR", "PARAR"…) NÃO dispara automação: o opt-out é
    -- gravado logo depois desta linha e o despachante podia rodar no meio,
    -- respondendo a quem acabou de pedir para parar.
    IF btrim(coalesce(NEW.body, '')) ~* '^(sair|parar|pare|stop|cancelar|descadastrar|remover)([[:space:]]+(por favor|pf))?[[:space:].!]*$' THEN
      RETURN NEW;
    END IF;

    -- Resposta a uma pesquisa de satisfação ("1" a "5") NÃO dispara automação: a nota é gravada logo
    -- depois desta linha e uma resposta automática ao "5" seria ruído para quem acabou de avaliar.
    IF v_conv.csat_requested_at IS NOT NULL
       AND v_conv.csat_score IS NULL
       AND v_conv.csat_requested_at > now() - interval '48 hours'
       AND btrim(coalesce(NEW.body, '')) ~ '^[1-5][[:space:].!]*$' THEN
      RETURN NEW;
    END IF;

    -- Tetos. Sem eles, o cliente (ou quem escreve ao número) manda 500 "oi" e a
    -- empresa enfileira — e paga — 500 respostas, atrasando as automações dos
    -- leads legítimos (a fila anda por `created_at`).
    --   * por conversa: no máximo 5 jobs por regra... somados, em 10 minutos;
    --   * por empresa: no máximo 500 pendentes.
    IF (SELECT count(*) FROM public.automation_jobs j
         WHERE j.company_id = NEW.company_id
           AND j.trigger_event = 'whatsapp_message_received'
           AND j.created_at > now() - interval '10 minutes'
           AND j.payload ->> 'conversation_id' = NEW.conversation_id::text) >= 5 THEN
      RETURN NEW;
    END IF;
    IF (SELECT count(*) FROM public.automation_jobs j
         WHERE j.company_id = NEW.company_id AND j.status = 'pending') >= 500 THEN
      RETURN NEW;
    END IF;

    SELECT count(*) = 1 INTO v_primeira
      FROM public.wa_messages
     WHERE conversation_id = NEW.conversation_id
       AND direction = 'inbound' AND origin = 'customer';

    PERFORM public.enfileirar_automacao(
      NEW.company_id,
      'whatsapp_message_received',
      v_lead_id,
      jsonb_build_object(
        'lead_id', v_lead_id,
        'conversation_id', NEW.conversation_id,
        'wa_id', v_contato.wa_id,
        'telefone', v_contato.wa_id,
        'nome', coalesce(nullif(btrim(v_lead.name), ''), v_contato.profile_name),
        'email', v_lead.email,
        'score', v_lead.score,
        'temperatura', v_lead.temperature,
        'origem', v_lead.source,
        'texto', coalesce(NEW.body, ''),
        'tipo_mensagem', NEW.type,
        'primeira_mensagem', CASE WHEN v_primeira THEN 'true' ELSE 'false' END,
        'veio_de_anuncio', CASE WHEN v_conv.origin IS NULL THEN 'false' ELSE 'true' END
      ),
      'msg:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;
