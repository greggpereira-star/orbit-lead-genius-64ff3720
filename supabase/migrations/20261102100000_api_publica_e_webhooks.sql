-- API pública com chaves e webhooks de saída assinados.
--
-- Dois recursos vendidos por plano (`api_publica`, `webhooks_assinados`). A
-- conferência do plano mora no SERVIDOR, a cada requisição e a cada envio: este
-- arquivo só guarda os dados e o que precisa ser atômico no banco.
--
-- Princípios:
--  * Chave de API: só o hash (SHA-256) é guardado. A chave inteira aparece uma
--    única vez, na criação. Perdeu, gera outra — nunca "recupera".
--  * Segredo de webhook: precisa ser legível para assinar, então fica em coluna
--    que o navegador não consegue ler (grant por coluna) e que só o servidor usa.
--  * Escrita em tudo isto é só do servidor (service_role). O navegador lê a lista
--    (sem hash, sem segredo) e passa por server functions para mudar qualquer coisa.
--  * Evento de webhook nasce no MESMO commit do lead (gatilho → fila). Se o envio
--    falha, a fila tenta de novo; se o lead não é gravado, o evento não existe.

-- ---------------------------------------------------------------------------
-- 1. Chaves de API
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome           text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
  -- Início da chave, só para o dono reconhecê-la na lista. Não autentica nada.
  prefixo        text NOT NULL,
  hash           text NOT NULL UNIQUE,
  escopos        text[] NOT NULL DEFAULT ARRAY['leads:read'],
  criada_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em      timestamptz NOT NULL DEFAULT now(),
  expira_em      timestamptz,
  ultimo_uso_em  timestamptz,
  revogada_em    timestamptz,
  CONSTRAINT api_keys_escopos_validos
    CHECK (cardinality(escopos) > 0 AND escopos <@ ARRAY['leads:read', 'leads:write'])
);

CREATE INDEX IF NOT EXISTS api_keys_empresa ON public.api_keys (company_id, criada_em DESC);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_leitura ON public.api_keys;
CREATE POLICY api_keys_leitura ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.eh_admin_da_empresa(company_id));

REVOKE ALL ON public.api_keys FROM PUBLIC, anon, authenticated;
-- Sem `hash`: nem o administrador lê o hash da própria chave.
GRANT SELECT (id, company_id, nome, prefixo, escopos, criada_por, criada_em, expira_em, ultimo_uso_em, revogada_em)
  ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Limite de taxa (janela de 1 minuto, por chave)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_limite (
  key_id   uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  janela   timestamptz NOT NULL,
  n        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, janela)
);

ALTER TABLE public.api_limite ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_limite FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_limite TO service_role;

-- Conta uma requisição e diz se ainda cabe no limite. Atômica: duas requisições
-- simultâneas nunca leem o mesmo contador. Devolve a contagem DEPOIS de somar.
CREATE OR REPLACE FUNCTION public.api_consumir_limite(p_key_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.chamada_de_servidor() THEN
    RAISE EXCEPTION 'apenas o servidor' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.api_limite AS l (key_id, janela, n)
  VALUES (p_key_id, date_trunc('minute', now()), 1)
  ON CONFLICT (key_id, janela) DO UPDATE SET n = l.n + 1
  RETURNING n INTO v_n;

  -- Faxina da própria chave: custa um índice de chave primária e evita um job só para isso.
  DELETE FROM public.api_limite
   WHERE key_id = p_key_id AND janela < now() - interval '1 hour';

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.api_consumir_limite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_consumir_limite(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Endpoints de webhook e fila de entregas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome              text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
  url               text NOT NULL CHECK (char_length(url) <= 2000),
  -- Cifrado em repouso pelo servidor (AES-256-GCM, `v1.<iv>.<tag>.<dado>`); nunca texto puro.
  segredo           text NOT NULL,
  eventos           text[] NOT NULL,
  ativo             boolean NOT NULL DEFAULT true,
  -- Entregas seguidas que esgotaram as tentativas. Passando do limite, o endpoint
  -- é desligado: destino morto não pode encher a fila para sempre.
  falhas_seguidas   integer NOT NULL DEFAULT 0,
  desativado_motivo text,
  criada_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  ultima_entrega_em timestamptz,
  CONSTRAINT webhook_endpoints_eventos_validos
    CHECK (cardinality(eventos) > 0 AND eventos <@ ARRAY['lead.created', 'lead.stage_changed'])
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_empresa_ativos
  ON public.webhook_endpoints (company_id) WHERE ativo;

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_leitura ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_leitura ON public.webhook_endpoints
  FOR SELECT TO authenticated
  USING (public.eh_admin_da_empresa(company_id));

REVOKE ALL ON public.webhook_endpoints FROM PUBLIC, anon, authenticated;
-- Sem `segredo`: ele só sai do banco para o servidor assinar, e na tela aparece uma vez.
GRANT SELECT (id, company_id, nome, url, eventos, ativo, falhas_seguidas, desativado_motivo,
              criada_por, criada_em, ultima_entrega_em)
  ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint_id          uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  evento               text NOT NULL,
  -- Identifica o EVENTO (igual em todos os endpoints). O destinatário usa para
  -- descartar repetição: a entrega é "pelo menos uma vez", não "exatamente uma".
  event_id             uuid NOT NULL,
  payload              jsonb NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts             integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ultimo_status        integer,
  ultimo_erro          text,
  criada_em            timestamptz NOT NULL DEFAULT now(),
  iniciada_em          timestamptz,
  concluida_em         timestamptz,
  CONSTRAINT webhook_deliveries_unica UNIQUE (endpoint_id, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_fila
  ON public.webhook_deliveries (proxima_tentativa_em) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint
  ON public.webhook_deliveries (endpoint_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_concluidas
  ON public.webhook_deliveries (concluida_em) WHERE concluida_em IS NOT NULL;

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_deliveries_leitura ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_leitura ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.eh_admin_da_empresa(company_id));

REVOKE ALL ON public.webhook_deliveries FROM PUBLIC, anon, authenticated;
-- Sem `payload`: é cópia de dados de lead; o histórico mostra só o resultado do envio.
GRANT SELECT (id, company_id, endpoint_id, evento, event_id, status, attempts,
              proxima_tentativa_em, ultimo_status, ultimo_erro, criada_em, concluida_em)
  ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Formato público do lead (o MESMO da API e do webhook)
-- ---------------------------------------------------------------------------
-- A lista de campos aqui e `CAMPOS_PUBLICOS_DO_LEAD` em src/lib/apiPublica/leads.ts
-- precisam ser iguais; um teste compara as duas. Fica de fora de propósito o que
-- é interno ou identifica o visitante: gclid/fbclid, metadata, device_info,
-- location_info, assigned_to, cvcrm_id, sync_status.
CREATE OR REPLACE FUNCTION public.lead_para_api(p_lead public.leads)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_lead.id,
    'name', p_lead.name,
    'email', p_lead.email,
    'phone', p_lead.phone,
    'city', p_lead.city,
    'status', p_lead.status,
    'stage_id', p_lead.stage_id,
    'source', p_lead.source,
    'utm_source', p_lead.utm_source,
    'utm_medium', p_lead.utm_medium,
    'utm_campaign', p_lead.utm_campaign,
    'utm_content', p_lead.utm_content,
    'utm_term', p_lead.utm_term,
    'landing_page', p_lead.landing_page,
    'score', p_lead.score,
    'temperature', p_lead.temperature,
    'deal_value', p_lead.deal_value,
    'deal_currency', p_lead.deal_currency,
    'external_id', p_lead.external_id,
    'custom_fields', p_lead.custom_fields,
    'created_at', p_lead.created_at,
    'updated_at', p_lead.updated_at
  );
$$;

REVOKE ALL ON FUNCTION public.lead_para_api(public.leads) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_para_api(public.leads) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Gatilho: lead criado / lead mudou de etapa → fila de entregas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enfileirar_webhooks_de_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento   text;
  v_event_id uuid := gen_random_uuid();
  v_dados    jsonb;
  v_de       record;
  v_para     record;
BEGIN
  BEGIN
    -- Saída rápida: empresa sem endpoint ativo (a esmagadora maioria) custa uma
    -- consulta indexada e nada mais.
    IF NOT EXISTS (
      SELECT 1 FROM public.webhook_endpoints e WHERE e.company_id = NEW.company_id AND e.ativo
    ) THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_evento := 'lead.created';
      v_dados := jsonb_build_object('lead', public.lead_para_api(NEW));
    ELSE
      v_evento := 'lead.stage_changed';
      SELECT s.id, s.name, s.kind INTO v_de   FROM public.stages s WHERE s.id = OLD.stage_id;
      SELECT s.id, s.name, s.kind INTO v_para FROM public.stages s WHERE s.id = NEW.stage_id;
      v_dados := jsonb_build_object(
        'lead', public.lead_para_api(NEW),
        'from_stage', CASE WHEN v_de.id   IS NULL THEN NULL
                           ELSE jsonb_build_object('id', v_de.id,   'name', v_de.name,   'kind', v_de.kind) END,
        'to_stage',   CASE WHEN v_para.id IS NULL THEN NULL
                           ELSE jsonb_build_object('id', v_para.id, 'name', v_para.name, 'kind', v_para.kind) END
      );
    END IF;

    INSERT INTO public.webhook_deliveries (company_id, endpoint_id, evento, event_id, payload)
    SELECT NEW.company_id, e.id, v_evento, v_event_id,
           jsonb_build_object(
             'id', v_event_id,
             'type', v_evento,
             'created_at', now(),
             'data', v_dados
           )
      FROM public.webhook_endpoints e
     WHERE e.company_id = NEW.company_id
       AND e.ativo
       AND v_evento = ANY (e.eventos);
  EXCEPTION WHEN OTHERS THEN
    -- Webhook é acessório; perder o lead não. Mesma regra do gatilho de automação,
    -- que já derrubou toda inserção de lead por um dia quando não tinha esta proteção.
    RAISE WARNING 'enfileirar webhooks falhou para o lead %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_webhooks_de_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_webhooks_criado ON public.leads;
CREATE TRIGGER leads_webhooks_criado
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enfileirar_webhooks_de_lead();

-- Só quando a etapa MUDA de fato: o `WHEN` evita acordar o gatilho a cada edição de nome.
DROP TRIGGER IF EXISTS leads_webhooks_etapa ON public.leads;
CREATE TRIGGER leads_webhooks_etapa
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.enfileirar_webhooks_de_lead();

-- ---------------------------------------------------------------------------
-- 6. Reserva do lote e limpeza (usadas pelo despachante)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_entregas_de_webhook(p_limite integer DEFAULT 25)
RETURNS SETOF public.webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.chamada_de_servidor() THEN
    RAISE EXCEPTION 'apenas o servidor' USING ERRCODE = '42501';
  END IF;

  -- Entrega que ficou 'running' por mais de 5 minutos é de um despachante que
  -- caiu no meio: volta para a fila (a tentativa já foi contada).
  UPDATE public.webhook_deliveries
     SET status = 'pending', proxima_tentativa_em = now()
   WHERE status = 'running' AND iniciada_em < now() - interval '5 minutes';

  RETURN QUERY
  UPDATE public.webhook_deliveries d
     SET status = 'running', iniciada_em = now(), attempts = d.attempts + 1
   WHERE d.id IN (
     SELECT f.id FROM public.webhook_deliveries f
      WHERE f.status = 'pending' AND f.proxima_tentativa_em <= now()
      ORDER BY f.proxima_tentativa_em
      LIMIT greatest(1, least(p_limite, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_entregas_de_webhook(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_entregas_de_webhook(integer) TO service_role;

-- Guarda 30 dias de histórico de envio.
CREATE OR REPLACE FUNCTION public.limpar_entregas_de_webhook()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.chamada_de_servidor() THEN
    RAISE EXCEPTION 'apenas o servidor' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.webhook_deliveries
   WHERE concluida_em IS NOT NULL AND concluida_em < now() - interval '30 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_entregas_de_webhook() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_entregas_de_webhook() TO service_role;

-- Conta uma entrega esgotada e desliga o endpoint ao passar do limite. Em SQL, e
-- não lido-e-gravado no servidor: entregas do mesmo endpoint falham em paralelo, e
-- um contador lido antes de ser somado perderia contagens.
CREATE OR REPLACE FUNCTION public.registrar_falha_de_endpoint(p_endpoint_id uuid, p_limite integer, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo boolean;
BEGIN
  IF NOT public.chamada_de_servidor() THEN
    RAISE EXCEPTION 'apenas o servidor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.webhook_endpoints e
     SET falhas_seguidas = e.falhas_seguidas + 1,
         ativo = CASE WHEN e.falhas_seguidas + 1 >= p_limite THEN false ELSE e.ativo END,
         desativado_motivo = CASE WHEN e.falhas_seguidas + 1 >= p_limite AND e.ativo
                                  THEN left(p_motivo, 300) ELSE e.desativado_motivo END
   WHERE e.id = p_endpoint_id
  RETURNING e.ativo INTO v_ativo;

  RETURN coalesce(v_ativo, false);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_falha_de_endpoint(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_falha_de_endpoint(uuid, integer, text) TO service_role;
