-- Gatilhos por tempo (cliente sem resposta, janela de 24h expirando) e a ação "Notificar equipe".
--
-- Decisões do produto (24/10/2026):
--   * "sem resposta" conta em horário corrido;
--   * só resposta HUMANA conta como resposta: `agent` (atendente na tela) e `app_echo` (quem
--     responde pelo aplicativo do celular). `automation` e `history` não encerram a espera;
--   * os minutos são livres, entre 5 e 1380.
--
-- Mecânica: uma função de varredura roda a cada minuto no pg_cron (SQL puro, sem HTTP) e enfileira
-- em `automation_jobs`; o trabalhador que já existe executa as ações. A chave de dedup inclui a
-- conversa e o horário da última mensagem do cliente: cada mensagem nova do cliente abre um
-- episódio novo, e dentro do episódio a regra dispara uma vez só.

-- 1. Vocabulário ------------------------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tabela
      FROM pg_constraint con
     WHERE con.contype = 'c'
       AND con.conrelid IN ('public.automation_rules'::regclass, 'public.automation_actions'::regclass)
       AND (pg_get_constraintdef(con.oid) ILIKE '%trigger_event%'
            OR pg_get_constraintdef(con.oid) ILIKE '%action_type%')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tabela, c.conname);
  END LOOP;
END $$;

ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_trigger_event_check CHECK (trigger_event IN (
    'lead_created',
    'stage_changed',
    'form_abandoned',
    'whatsapp_message_received',
    'tag_added',
    'customer_no_reply',
    'window_expiring'
  ));

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (action_type IN (
    'etiquetar',
    'mover_etapa',
    'atribuir_responsavel',
    'enviar_whatsapp',
    'webhook',
    'enviar_template',
    'atribuir_conversa',
    'notificar_equipe'
  ));

-- 2. Parâmetro do gatilho ---------------------------------------------------------------------
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Os gatilhos por tempo precisam dos minutos, inteiros e dentro do limite. Sem isso uma regra com
-- "abc" ou 0 minutos dispararia a cada varredura (ou nunca) sem ninguém perceber.
ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_minutos_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_minutos_check CHECK (
    trigger_event NOT IN ('customer_no_reply', 'window_expiring')
    -- CASE, e não AND: sem `minutos` a comparação dá NULL, e CHECK aceita NULL; e o AND não
    -- garante que o teste do formato venha antes da conversão para inteiro.
    OR CASE
         WHEN (trigger_config ->> 'minutos') ~ '^[0-9]{1,4}$'
           THEN (trigger_config ->> 'minutos')::int BETWEEN 5 AND 1380
         ELSE false
       END
  );

-- 3. Avisos para a equipe ---------------------------------------------------------------------
-- Uma linha por destinatário: cada pessoa lê (e dispensa) o seu aviso sem afetar os outros.
CREATE TABLE IF NOT EXISTS public.team_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  -- Reexecutar o mesmo job (nova tentativa) não duplica o aviso: (user_id, dedup_key) é único.
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
-- Sem WHERE de propósito: o upsert do PostgREST (`onConflict: user_id,dedup_key`) só casa com índice
-- único completo. Linhas sem chave (NULL) não se conflitam entre si, então não há efeito colateral.
CREATE UNIQUE INDEX IF NOT EXISTS team_notifications_dedup_uniq
  ON public.team_notifications (user_id, dedup_key);
CREATE INDEX IF NOT EXISTS team_notifications_user_idx
  ON public.team_notifications (user_id, created_at DESC);

ALTER TABLE public.team_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_notifications_leitura ON public.team_notifications;
CREATE POLICY team_notifications_leitura ON public.team_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.check_membership(company_id));

DROP POLICY IF EXISTS team_notifications_ler ON public.team_notifications;
CREATE POLICY team_notifications_ler ON public.team_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.check_membership(company_id))
  WITH CHECK (user_id = auth.uid() AND public.check_membership(company_id));

-- Quem recebe o aviso só pode marcá-lo como lido: título e destino não se editam.
REVOKE ALL ON public.team_notifications FROM authenticated, anon;
GRANT SELECT ON public.team_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.team_notifications TO authenticated;
GRANT ALL ON public.team_notifications TO service_role;

-- 4. Índice da varredura ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS wa_conversations_espera_idx
  ON public.wa_conversations (last_inbound_at DESC)
  WHERE status <> 'resolved' AND last_inbound_at IS NOT NULL;

-- 5. A varredura ------------------------------------------------------------------------------
-- Faixa de tolerância do "sem resposta": dispara quando a espera está entre X e X + 120 min. Sem o
-- teto, ligar a regra dispararia para TODA conversa que já esperava há horas; com ele, cobre só
-- um atraso curto da própria varredura (queda do servidor, por exemplo).
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

REVOKE ALL ON FUNCTION public.varrer_gatilhos_de_tempo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.varrer_gatilhos_de_tempo() TO service_role;

-- 6. Agendamento (todo minuto) ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('varredura-gatilhos-de-tempo')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'varredura-gatilhos-de-tempo');
    PERFORM cron.schedule(
      'varredura-gatilhos-de-tempo',
      '* * * * *',
      'SELECT public.varrer_gatilhos_de_tempo();'
    );
  END IF;
END $$;
