-- Campos personalizados no lead.
--
-- Cada empresa define os seus campos (texto, número, data ou lista de opções) em Configurações →
-- Campos personalizados; o valor de cada lead fica em `leads.custom_fields` (jsonb, chave = a chave do
-- campo). NÃO usa `leads.metadata`: aquilo é rastro de origem (quiz, UTMs) e não se reescreve à mão.
--
-- Entram em toda automação como `cf_<chave>`, para servir de condição ("cf_orcamento maior que 5000")
-- e de texto ("{{cf_curso}}"), tanto nos eventos que passam por `enfileirar_automacao` quanto nos
-- gatilhos por tempo (a varredura monta o próprio payload e ganha o mesmo mesclador).

-- 1. Definições -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Identificador estável (não muda ao renomear o rótulo): vira `cf_<key>` nas automações.
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  type text NOT NULL CHECK (type IN ('text', 'number', 'date', 'select')),
  -- Só para `select`: lista de opções (texto).
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  position integer NOT NULL DEFAULT 0,
  -- Desativar esconde da tela sem apagar o que já foi preenchido.
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);

ALTER TABLE public.custom_field_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_field_defs_leitura ON public.custom_field_defs;
CREATE POLICY custom_field_defs_leitura ON public.custom_field_defs
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

DROP POLICY IF EXISTS custom_field_defs_escrita ON public.custom_field_defs;
CREATE POLICY custom_field_defs_escrita ON public.custom_field_defs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.company_id = custom_field_defs.company_id
                    AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m
                       WHERE m.company_id = custom_field_defs.company_id
                         AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));

REVOKE ALL ON public.custom_field_defs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_defs TO authenticated;
GRANT ALL ON public.custom_field_defs TO service_role;

-- 2. Valores no lead ---------------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_custom_fields_objeto;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_custom_fields_objeto CHECK (jsonb_typeof(custom_fields) = 'object');

-- Grava UM campo (sem reescrever o objeto inteiro: duas pessoas editando campos diferentes não se
-- sobrescrevem). SECURITY INVOKER: quem não pode editar o lead não passa por aqui. Valida pelo TIPO do
-- campo; vazio limpa o valor.
CREATE OR REPLACE FUNCTION public.definir_campo_do_lead(p_lead_id uuid, p_key text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_def public.custom_field_defs%ROWTYPE;
  v_txt text := nullif(btrim(coalesce(p_value, '')), '');
  v_valor jsonb;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_def FROM public.custom_field_defs
   WHERE company_id = v_lead.company_id AND key = p_key AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campo_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF v_txt IS NULL THEN
    UPDATE public.leads SET custom_fields = custom_fields - p_key WHERE id = p_lead_id;
  ELSE
    IF v_def.type = 'number' THEN
      IF v_txt !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
        RAISE EXCEPTION 'valor_invalido: % não é número', v_def.label USING ERRCODE = '22023';
      END IF;
      v_valor := to_jsonb(replace(v_txt, ',', '.')::numeric);
    ELSIF v_def.type = 'date' THEN
      BEGIN
        v_valor := to_jsonb(v_txt::date::text);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'valor_invalido: % não é data', v_def.label USING ERRCODE = '22023';
      END;
    ELSIF v_def.type = 'select' THEN
      IF NOT (v_def.options ? v_txt) THEN
        RAISE EXCEPTION 'valor_invalido: % não é uma opção de %', v_txt, v_def.label USING ERRCODE = '22023';
      END IF;
      v_valor := to_jsonb(v_txt);
    ELSE
      IF char_length(v_txt) > 500 THEN
        RAISE EXCEPTION 'valor_invalido: texto muito longo (máx. 500)' USING ERRCODE = '22023';
      END IF;
      v_valor := to_jsonb(v_txt);
    END IF;
    UPDATE public.leads
       SET custom_fields = jsonb_set(custom_fields, ARRAY[p_key], v_valor, true)
     WHERE id = p_lead_id;
  END IF;

  RETURN (SELECT custom_fields FROM public.leads WHERE id = p_lead_id);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_campo_do_lead(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_campo_do_lead(uuid, text, text) TO authenticated, service_role;

-- 3. Para as automações: `cf_<chave>` -> valor (só os preenchidos) ---------------------------------------
-- DEFINER e sem GRANT para quem entra pela API: devolve dado de lead por id. Só as funções do motor
-- (que são do dono) a chamam.
CREATE OR REPLACE FUNCTION public.campos_do_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_object_agg('cf_' || e.key, e.value), '{}'::jsonb)
    FROM public.leads l, jsonb_each_text(l.custom_fields) AS e(key, value)
   WHERE l.id = p_lead_id AND e.value <> '';
$$;
REVOKE ALL ON FUNCTION public.campos_do_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campos_do_lead(uuid) TO service_role;

-- 4. Os campos entram em todo evento (definição vigente de `enfileirar_automacao` + mesclador) ----------
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
  v_payload jsonb := public.campos_do_lead(p_lead_id) || coalesce(p_payload, '{}'::jsonb)
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

-- 5. ...e na varredura dos gatilhos por tempo (definição vigente + mesclador) ---------------------------
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
    ) || public.campos_do_lead(m.lead_id) AS payload
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
    ) || public.campos_do_lead(b.lead_id) AS payload
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
    ) || public.campos_do_lead(m.lead_id) AS payload
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
    ) || public.campos_do_lead(m.lead_id) AS payload
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
