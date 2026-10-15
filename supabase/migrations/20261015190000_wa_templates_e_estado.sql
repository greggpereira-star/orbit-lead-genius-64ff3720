-- WhatsApp Cloud API — Fase 2: templates e estado do número.
--
-- Depende de `20261015180000_wa_fundacao.sql`. NÃO foi executada contra a base de
-- produção; ensaiada num Postgres 16 descartável.

-- ---------------------------------------------------------------------------
-- 1. Estado do número (coexistência e saúde)
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_phone_numbers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disconnected')),
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnection_reason text,
  -- Quando o app foi inscrito nos webhooks da WABA. Sem isto o número "conecta"
  -- e nada chega — o sintoma é silêncio, por isso o estado é visível.
  ADD COLUMN IF NOT EXISTS webhook_subscribed_at timestamptz,
  -- 0–100, do webhook `history`. 100 = sincronização de histórico concluída.
  ADD COLUMN IF NOT EXISTS history_progress integer
    CHECK (history_progress IS NULL OR history_progress BETWEEN 0 AND 100);

-- ---------------------------------------------------------------------------
-- 2. Templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.wa_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  -- PENDING | APPROVED | REJECTED | PAUSED | DISABLED | IN_APPEAL …  (livre: a Meta
  -- acrescenta estados; recusar um desconhecido perderia o template).
  status text NOT NULL DEFAULT 'PENDING',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  quality text,
  synced_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name, language)
);
CREATE INDEX IF NOT EXISTS wa_templates_empresa_idx ON public.wa_templates (company_id, status);

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_templates_leitura ON public.wa_templates;
CREATE POLICY wa_templates_leitura ON public.wa_templates
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
GRANT SELECT ON public.wa_templates TO authenticated;
GRANT ALL ON public.wa_templates TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Funções de ingestão (mesmo desenho da fundação: idempotentes)
-- ---------------------------------------------------------------------------

-- Ordem dos estados de template. Um evento ATRASADO (PENDING depois de APPROVED)
-- não pode rebaixar. REJECTED/DISABLED/PAUSED são decisões da Meta e vencem.
CREATE OR REPLACE FUNCTION public.wa_ordem_do_template(p_status text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(coalesce(p_status, ''))
    WHEN 'PENDING' THEN 0
    WHEN 'IN_APPEAL' THEN 1
    WHEN 'APPROVED' THEN 2
    WHEN 'PAUSED' THEN 3
    WHEN 'REJECTED' THEN 3
    WHEN 'DISABLED' THEN 4
    ELSE 1
  END;
$$;

-- `message_template_status_update`. Só atualiza templates que existem: um evento
-- sobre template criado fora do produto aparece na próxima sincronização.
CREATE OR REPLACE FUNCTION public.wa_aplicar_status_de_template(
  p_waba_id text,
  p_name text,
  p_language text,
  p_status text,
  p_reason text DEFAULT NULL,
  p_provider_template_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conta uuid;
  v_atual public.wa_templates%ROWTYPE;
BEGIN
  SELECT id INTO v_conta FROM public.wa_accounts WHERE waba_id = p_waba_id LIMIT 1;
  IF v_conta IS NULL THEN
    RAISE EXCEPTION 'conta_desconhecida:%', p_waba_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_atual FROM public.wa_templates
   WHERE account_id = v_conta AND name = p_name AND language = p_language;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.wa_ordem_do_template(p_status) < public.wa_ordem_do_template(v_atual.status) THEN
    RETURN false;
  END IF;

  UPDATE public.wa_templates
     SET status = upper(p_status),
         rejection_reason = CASE
           WHEN upper(p_status) IN ('REJECTED', 'DISABLED', 'PAUSED')
           THEN coalesce(nullif(btrim(p_reason), ''), rejection_reason)
           ELSE NULL END,
         provider_template_id = coalesce(p_provider_template_id, provider_template_id),
         updated_at = now()
   WHERE id = v_atual.id;
  RETURN true;
END;
$$;

-- `account_update` (PARTNER_REMOVED / ACCOUNT_OFFBOARDED / ACCOUNT_RECONNECTED).
-- ACCOUNT_OFFBOARDED não traz o número: vale para todos os da WABA.
CREATE OR REPLACE FUNCTION public.wa_atualizar_estado_do_numero(
  p_waba_id text,
  p_display_phone text,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
  v_digitos text := regexp_replace(coalesce(p_display_phone, ''), '\D', '', 'g');
BEGIN
  IF p_status NOT IN ('active', 'disconnected') THEN
    RAISE EXCEPTION 'estado_invalido:%', p_status;
  END IF;

  UPDATE public.wa_phone_numbers n
     SET status = p_status,
         disconnected_at = CASE WHEN p_status = 'disconnected' THEN now() ELSE NULL END,
         disconnection_reason = CASE WHEN p_status = 'disconnected' THEN left(p_reason, 200) ELSE NULL END
    FROM public.wa_accounts a
   WHERE n.account_id = a.id
     AND a.waba_id = p_waba_id
     AND (v_digitos = '' OR regexp_replace(n.display_phone, '\D', '', 'g') = v_digitos);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Progresso da sincronização de histórico (coexistência).
CREATE OR REPLACE FUNCTION public.wa_atualizar_historico(
  p_phone_number_id text,
  p_progress integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.wa_phone_numbers
     SET history_progress = greatest(coalesce(history_progress, 0), least(100, greatest(0, p_progress))),
         coexistence_synced_at = CASE
           WHEN p_progress >= 100 AND coexistence_synced_at IS NULL THEN now()
           ELSE coexistence_synced_at END
   WHERE phone_number_id = p_phone_number_id;
$$;

REVOKE ALL ON FUNCTION public.wa_ordem_do_template(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_aplicar_status_de_template(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_atualizar_estado_do_numero(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_atualizar_historico(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_aplicar_status_de_template(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_atualizar_estado_do_numero(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_atualizar_historico(text,integer) TO service_role;
