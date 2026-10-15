-- WhatsApp oficial — Fase 4: automação.
--
-- Depende de `20261004190000_motor_de_automacao.sql` e das migrações `wa_*`.
-- NÃO foi executada contra a base de produção; ensaiada num Postgres 16
-- descartável, com as definições REAIS do motor.

-- ---------------------------------------------------------------------------
-- 1. Vocabulário do motor: um evento e duas ações novas
-- ---------------------------------------------------------------------------
-- Os CHECK foram criados inline e, por isso, têm nome gerado. Em vez de apostar
-- no nome, procura-se pela definição: derruba o que cita a coluna e recria.
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
    'whatsapp_message_received'
  ));

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (action_type IN (
    'etiquetar',
    'mover_etapa',
    'atribuir_responsavel',
    'enviar_whatsapp',
    'webhook',
    'enviar_template',
    'atribuir_conversa'
  ));

-- ---------------------------------------------------------------------------
-- 2. Conversa garantida para um contato
-- ---------------------------------------------------------------------------
-- Uma automação que manda template a um LEAD (que veio de formulário, nunca
-- escreveu no WhatsApp) precisa de uma conversa onde gravar a mensagem. Esta
-- função cria contato e conversa sem mensagem alguma, e é idempotente.
CREATE OR REPLACE FUNCTION public.wa_obter_ou_criar_conversa(
  p_company_id uuid,
  p_wa_id text,
  p_lead_id uuid DEFAULT NULL,
  p_profile_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_num public.wa_phone_numbers%ROWTYPE;
  v_contato uuid;
  v_conversa uuid;
BEGIN
  -- O primeiro número ATIVO da empresa. Com vários números o chamador passará o
  -- número escolhido; hoje o produto conecta um por empresa.
  SELECT * INTO v_num FROM public.wa_phone_numbers
   WHERE company_id = p_company_id AND status = 'active'
   ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sem_numero_ativo' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.wa_contacts (company_id, wa_id, profile_name, lead_id)
  VALUES (p_company_id, p_wa_id, nullif(btrim(p_profile_name), ''), p_lead_id)
  ON CONFLICT (company_id, wa_id) DO UPDATE
    SET lead_id = coalesce(public.wa_contacts.lead_id, EXCLUDED.lead_id)
  RETURNING id INTO v_contato;

  INSERT INTO public.wa_conversations (company_id, phone_number_id, contact_id, lead_id)
  VALUES (p_company_id, v_num.id, v_contato, p_lead_id)
  ON CONFLICT (phone_number_id, contact_id) DO UPDATE
    SET lead_id = coalesce(public.wa_conversations.lead_id, EXCLUDED.lead_id)
  RETURNING id INTO v_conversa;

  RETURN v_conversa;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_obter_ou_criar_conversa(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_obter_ou_criar_conversa(uuid, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Gatilho: mensagem do cliente → automação
-- ---------------------------------------------------------------------------
-- Só mensagem do CLIENTE. Eco do app, saída e histórico importado NÃO disparam:
-- importar 180 dias de conversa não pode acionar 180 dias de automação.
--
-- `exception when others` é obrigatório (regra deste repositório): o gatilho de
-- histórico de etapa já derrubou todo insert de lead por 24 h por não ter. A
-- automação é acessório; perder a mensagem recebida não é.
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

DROP TRIGGER IF EXISTS wa_messages_automacao ON public.wa_messages;
CREATE TRIGGER wa_messages_automacao
  AFTER INSERT ON public.wa_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'inbound' AND NEW.origin = 'customer')
  EXECUTE FUNCTION public.wa_disparar_automacao_de_mensagem();
