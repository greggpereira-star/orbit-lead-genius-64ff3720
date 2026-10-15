-- WhatsApp sobre a Cloud API oficial — fundação (Fase 1).
--
-- Projeto: docs/whatsapp-business-api/00-auditoria-e-projeto.md (§5).
--
-- NÃO FOI EXECUTADA contra a base de produção. Ensaiada num Postgres 16
-- descartável com schema mínimo; rode `scripts/ensaio-wa-fundacao/rodar.sh`
-- contra a base real (BEGIN … ROLLBACK) antes de aplicar.
--
-- Princípios:
--   * Tudo por `company_id`, com RLS por `check_membership`.
--   * O cliente do navegador só LÊ (e atribui/resolve conversa). Toda escrita de
--     mensagem passa pelo servidor, com a chave de serviço.
--   * A ingestão é feita por FUNÇÕES no banco, atômicas e idempotentes: webhook
--     reentregue não duplica mensagem nem soma "não lidas" duas vezes, e status
--     fora de ordem (lida antes de entregue) nunca regride.
--   * Token de acesso em tabela SEM grant para `authenticated`.

-- ---------------------------------------------------------------------------
-- 1. Contas e números
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  business_id text,
  display_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, waba_id)
);

CREATE TABLE IF NOT EXISTS public.wa_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.wa_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Id do número na Graph API. É por ele que o webhook diz de quem é a mensagem.
  phone_number_id text NOT NULL UNIQUE,
  display_phone text NOT NULL,
  mode text NOT NULL DEFAULT 'coexistence' CHECK (mode IN ('coexistence', 'cloud_only')),
  quality text,
  messaging_tier text,
  is_on_biz_app boolean,
  -- Fim da sincronização única de histórico (coexistência).
  coexistence_synced_at timestamptz,
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_phone_numbers_empresa_idx ON public.wa_phone_numbers (company_id);

-- Segredos. Sem GRANT para `authenticated`: só a chave de serviço lê.
CREATE TABLE IF NOT EXISTS public.wa_credentials (
  account_id uuid PRIMARY KEY REFERENCES public.wa_accounts(id) ON DELETE CASCADE,
  -- Guardado como o servidor entregar (cifrado na aplicação ou via Vault).
  access_token_enc text NOT NULL,
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Contato, conversa, mensagem
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- `wa_id` canônico da Meta: E.164 sem '+'.
  wa_id text NOT NULL,
  profile_name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, wa_id)
);
CREATE INDEX IF NOT EXISTS wa_contacts_lead_idx ON public.wa_contacts (lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.wa_phone_numbers(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.wa_contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  assigned_to uuid,
  department_id uuid REFERENCES public.chat_departments(id) ON DELETE SET NULL,
  -- Base da janela de 24h: só mensagem DO CLIENTE a abre.
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  unread_agent integer NOT NULL DEFAULT 0 CHECK (unread_agent >= 0),
  -- `referral` do primeiro contato vindo de anúncio (ctwa_clid, source_id, …).
  origin jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id, contact_id)
);
CREATE INDEX IF NOT EXISTS wa_conversations_lista_idx
  ON public.wa_conversations (company_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS wa_conversations_atendente_idx
  ON public.wa_conversations (company_id, assigned_to, status);

CREATE TABLE IF NOT EXISTS public.wa_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_media_id text,
  mime text,
  size_bytes integer,
  sha256 text,
  storage_path text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  origin text NOT NULL CHECK (origin IN ('customer', 'agent', 'automation', 'app_echo', 'history')),
  provider_message_id text,
  type text NOT NULL,
  body text,
  payload jsonb,
  template_name text,
  media_id uuid REFERENCES public.wa_media(id) ON DELETE SET NULL,
  sent_by uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_code integer,
  error_title text,
  fbtrace_id text,
  reply_to uuid REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  -- Ordem REAL da mensagem (horário do provedor), não a da gravação.
  provider_ts timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Idempotência: o mesmo `wamid` não entra duas vezes na empresa.
CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_provider_uniq
  ON public.wa_messages (company_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_messages_conversa_idx
  ON public.wa_messages (conversation_id, provider_ts, id);

CREATE TABLE IF NOT EXISTS public.wa_message_status_events (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.wa_messages(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL,
  -- {billable, category, pricing_model} — base do custo por categoria.
  pricing jsonb,
  error jsonb,
  UNIQUE (provider_message_id, status, occurred_at)
);
CREATE INDEX IF NOT EXISTS wa_status_events_msg_idx ON public.wa_message_status_events (provider_message_id);

-- ---------------------------------------------------------------------------
-- 3. Entrada bruta de webhooks (idempotente, reprocessável)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key text NOT NULL UNIQUE,
  field text NOT NULL,
  phone_number_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  -- Backoff: sem isto as 5 tentativas se esgotavam em segundos, durante uma
  -- instabilidade passageira, e o evento ficava órfão.
  next_attempt_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS wa_webhook_events_fila_idx
  ON public.wa_webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- 4. RLS e grants
-- ---------------------------------------------------------------------------
-- Uma WABA pertence a UMA empresa. `UNIQUE (company_id, waba_id)` deixava duas
-- empresas apontarem para a mesma WABA, e as funções que resolvem por `waba_id`
-- (status de template, desconexão) passariam a agir sobre as duas.
CREATE UNIQUE INDEX IF NOT EXISTS wa_accounts_waba_uniq ON public.wa_accounts (waba_id);

ALTER TABLE public.wa_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_message_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_webhook_events ENABLE ROW LEVEL SECURITY;

-- Leitura por membro da empresa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_accounts','wa_phone_numbers','wa_contacts','wa_conversations',
                           'wa_media','wa_messages','wa_message_status_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_leitura', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.check_membership(company_id))',
      t || '_leitura', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- NENHUMA escrita direta do navegador. Atribuir, resolver, marcar como lida e
-- mover de setor passam pelas server functions, que conferem o PAPEL (viewer só
-- lê) e que o destino pertence à empresa. Uma versão anterior deste arquivo dava
-- UPDATE de coluna ao `authenticated` com a policy `check_membership`: como essa
-- função não olha o papel, um `viewer` resolvia e reatribuía conversa pelo
-- PostgREST, e `assigned_to`/`department_id` aceitavam id de OUTRA empresa.

-- `wa_credentials` e `wa_webhook_events`: nada para `authenticated`.
REVOKE ALL ON public.wa_credentials FROM anon, authenticated;
REVOKE ALL ON public.wa_webhook_events FROM anon, authenticated;
GRANT ALL ON public.wa_credentials TO service_role;
GRANT ALL ON public.wa_webhook_events TO service_role;
GRANT ALL ON public.wa_accounts, public.wa_phone_numbers, public.wa_contacts,
  public.wa_conversations, public.wa_media, public.wa_messages,
  public.wa_message_status_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.wa_message_status_events_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
-- Hoje a publicação só tem `chat_*`. Entram as duas tabelas que a tela escuta;
-- o RLS acima decide quem recebe cada linha.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Ingestão atômica e idempotente
-- ---------------------------------------------------------------------------

-- Ordem dos status. `failed` ganha de enviada/em fila; entregue e lida ganham
-- de tudo. Um evento nunca REBAIXA o estado: o Meta reentrega e entrega fora de
-- ordem, e "lida" chegando antes de "entregue" não pode voltar a "entregue".
CREATE OR REPLACE FUNCTION public.wa_ordem_do_status(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'queued' THEN 0
    WHEN 'received' THEN 0
    WHEN 'sent' THEN 1
    WHEN 'failed' THEN 2
    WHEN 'delivered' THEN 3
    WHEN 'read' THEN 4
    ELSE -1
  END;
$$;

-- Mensagem recebida do cliente, ou eco de mensagem enviada pelo celular.
--
-- Cria contato e conversa se faltarem, grava a mensagem uma única vez e só
-- então mexe nos contadores — reentrega do mesmo `wamid` devolve
-- `inserida = false` e não toca em nada.
CREATE OR REPLACE FUNCTION public.wa_registrar_mensagem(
  p_phone_number_id text,
  p_wa_id text,
  p_profile_name text,
  p_direction text,
  p_origin text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_payload jsonb,
  p_provider_ts timestamptz,
  p_referral jsonb DEFAULT NULL,
  p_status text DEFAULT NULL
)
-- Nomes `out_*` de propósito: `company_id` / `conversation_id` como colunas de
-- retorno colidiam com as colunas das tabelas nos `ON CONFLICT`.
RETURNS TABLE (out_conversa uuid, out_mensagem uuid, out_empresa uuid, inserida boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_num public.wa_phone_numbers%ROWTYPE;
  v_contato uuid;
  v_conversa uuid;
  v_msg uuid;
  v_preview text;
  v_ts timestamptz := coalesce(p_provider_ts, now());
BEGIN
  SELECT * INTO v_num FROM public.wa_phone_numbers WHERE phone_number_id = p_phone_number_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'numero_desconhecido:%', p_phone_number_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.wa_contacts (company_id, wa_id, profile_name)
  VALUES (v_num.company_id, p_wa_id, nullif(btrim(p_profile_name), ''))
  ON CONFLICT (company_id, wa_id) DO UPDATE
    SET profile_name = coalesce(nullif(btrim(EXCLUDED.profile_name), ''), public.wa_contacts.profile_name)
  RETURNING id INTO v_contato;

  INSERT INTO public.wa_conversations (company_id, phone_number_id, contact_id, origin)
  VALUES (v_num.company_id, v_num.id, v_contato, p_referral)
  ON CONFLICT (phone_number_id, contact_id) DO UPDATE
    -- A origem do ANÚNCIO é a do primeiro contato: não é sobrescrita.
    SET origin = coalesce(public.wa_conversations.origin, EXCLUDED.origin)
  RETURNING id INTO v_conversa;

  INSERT INTO public.wa_messages (
    company_id, conversation_id, direction, origin, provider_message_id,
    type, body, payload, status, provider_ts
  ) VALUES (
    v_num.company_id, v_conversa, p_direction, p_origin, p_provider_message_id,
    p_type, p_body, p_payload,
    coalesce(p_status, CASE WHEN p_direction = 'inbound' THEN 'received' ELSE 'sent' END),
    v_ts
  )
  ON CONFLICT (company_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_msg;

  IF v_msg IS NULL THEN
    -- Reentrega: devolve a existente e não altera contadores.
    SELECT m.id INTO v_msg FROM public.wa_messages m
     WHERE m.company_id = v_num.company_id AND m.provider_message_id = p_provider_message_id;
    RETURN QUERY SELECT v_conversa, v_msg, v_num.company_id, false;
    RETURN;
  END IF;

  v_preview := left(coalesce(nullif(btrim(p_body), ''), '[' || p_type || ']'), 140);

  UPDATE public.wa_conversations c
     SET last_message_at = greatest(coalesce(c.last_message_at, v_ts), v_ts),
         last_message_preview = CASE
           WHEN c.last_message_at IS NULL OR v_ts >= c.last_message_at THEN v_preview
           ELSE c.last_message_preview END,
         -- A janela de 24h abre SÓ com mensagem do cliente.
         last_inbound_at = CASE
           WHEN p_origin = 'customer' THEN greatest(coalesce(c.last_inbound_at, v_ts), v_ts)
           ELSE c.last_inbound_at END,
         unread_agent = CASE
           WHEN p_origin = 'customer' THEN c.unread_agent + 1
           ELSE c.unread_agent END,
         -- Cliente voltou a escrever numa conversa resolvida: reabre.
         status = CASE
           WHEN p_origin = 'customer' AND c.status = 'resolved' THEN 'open'
           ELSE c.status END
   WHERE c.id = v_conversa;

  RETURN QUERY SELECT v_conversa, v_msg, v_num.company_id, true;
END;
$$;

-- Saída: grava a mensagem que o servidor acabou de mandar à Meta e aplica os
-- status que já tenham chegado (o webhook pode ganhar da resposta da API).
CREATE OR REPLACE FUNCTION public.wa_registrar_saida(
  p_conversation_id uuid,
  p_origin text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_payload jsonb,
  p_sent_by uuid,
  p_template_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conv public.wa_conversations%ROWTYPE;
  v_msg uuid;
  v_melhor text;
  v_ts timestamptz := now();
BEGIN
  SELECT * INTO v_conv FROM public.wa_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversa_inexistente' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.wa_messages (
    company_id, conversation_id, direction, origin, provider_message_id,
    type, body, payload, template_name, sent_by, status, provider_ts
  ) VALUES (
    v_conv.company_id, p_conversation_id, 'outbound', p_origin, p_provider_message_id,
    p_type, p_body, p_payload, p_template_name, p_sent_by, 'sent', v_ts
  )
  ON CONFLICT (company_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_msg;

  IF v_msg IS NULL THEN
    SELECT m.id INTO v_msg FROM public.wa_messages m
     WHERE m.company_id = v_conv.company_id AND m.provider_message_id = p_provider_message_id;
    RETURN v_msg;
  END IF;

  UPDATE public.wa_conversations
     SET last_message_at = greatest(coalesce(last_message_at, v_ts), v_ts),
         last_message_preview = left(coalesce(nullif(btrim(p_body), ''), '[' || p_type || ']'), 140)
   WHERE id = p_conversation_id;

  -- O status pode ter chegado antes de este INSERT: aplica o mais avançado.
  UPDATE public.wa_message_status_events SET message_id = v_msg
   WHERE provider_message_id = p_provider_message_id AND message_id IS NULL;

  SELECT e.status INTO v_melhor
    FROM public.wa_message_status_events e
   WHERE e.provider_message_id = p_provider_message_id
   ORDER BY public.wa_ordem_do_status(e.status) DESC, e.occurred_at DESC
   LIMIT 1;

  IF v_melhor IS NOT NULL AND public.wa_ordem_do_status(v_melhor) > public.wa_ordem_do_status('sent') THEN
    UPDATE public.wa_messages SET status = v_melhor WHERE id = v_msg;
  END IF;

  RETURN v_msg;
END;
$$;

-- Status de entrega. Idempotente por (wamid, status, horário) e nunca rebaixa.
CREATE OR REPLACE FUNCTION public.wa_aplicar_status(
  p_phone_number_id text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_pricing jsonb DEFAULT NULL,
  p_error jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_num public.wa_phone_numbers%ROWTYPE;
  v_msg public.wa_messages%ROWTYPE;
  v_novo boolean;
BEGIN
  SELECT * INTO v_num FROM public.wa_phone_numbers WHERE phone_number_id = p_phone_number_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'numero_desconhecido:%', p_phone_number_id USING ERRCODE = 'P0002';
  END IF;

  IF public.wa_ordem_do_status(p_status) < 0 THEN RETURN false; END IF;

  SELECT * INTO v_msg FROM public.wa_messages
   WHERE company_id = v_num.company_id AND provider_message_id = p_provider_message_id;

  INSERT INTO public.wa_message_status_events (
    company_id, message_id, provider_message_id, status, occurred_at, pricing, error
  ) VALUES (
    v_num.company_id, v_msg.id, p_provider_message_id, p_status, p_occurred_at, p_pricing, p_error
  )
  ON CONFLICT (provider_message_id, status, occurred_at) DO NOTHING;
  GET DIAGNOSTICS v_novo = ROW_COUNT;

  IF v_msg.id IS NOT NULL
     AND public.wa_ordem_do_status(p_status) > public.wa_ordem_do_status(v_msg.status) THEN
    UPDATE public.wa_messages
       SET status = p_status,
           error_code = CASE WHEN p_status = 'failed' THEN nullif(p_error ->> 'code', '')::integer ELSE error_code END,
           error_title = CASE WHEN p_status = 'failed' THEN p_error ->> 'title' ELSE error_title END
     WHERE id = v_msg.id;
  END IF;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_registrar_mensagem(text,text,text,text,text,text,text,text,jsonb,timestamptz,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_saida(uuid,text,text,text,text,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_aplicar_status(text,text,text,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_registrar_mensagem(text,text,text,text,text,text,text,text,jsonb,timestamptz,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_registrar_saida(uuid,text,text,text,text,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_aplicar_status(text,text,text,timestamptz,jsonb,jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Retenção do que chega bruto
-- ---------------------------------------------------------------------------
-- `wa_webhook_events` guarda o payload COMPLETO e crescia sem teto. Processado e
-- ignorado vale por `p_dias`; `failed` vale mais (é o que se investiga).
CREATE OR REPLACE FUNCTION public.wa_limpar_eventos(p_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH apagados AS (
    DELETE FROM public.wa_webhook_events
     WHERE (status IN ('processed', 'ignored') AND received_at < now() - make_interval(days => greatest(p_dias, 7)))
        OR (status = 'failed' AND received_at < now() - make_interval(days => greatest(p_dias, 7) * 3))
    RETURNING 1
  )
  SELECT count(*)::integer FROM apagados;
$$;
REVOKE ALL ON FUNCTION public.wa_limpar_eventos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_limpar_eventos(integer) TO service_role;
