-- Duas coisas que faltavam para a conversão chegar ao Google Ads.
--
-- **O identificador do clique era jogado fora.** `leads.gclid` e
-- `leads.fbclid` existem desde sempre e estão em 0 de 122 leads. A URL do
-- quiz traz o `gclid`, o navegador manda no `tracking`, e a função de captura
-- gravava só as UTMs. Sem o gclid, a importação de conversão offline não tem
-- a que se ligar: o Google precisa dele para saber QUAL clique virou cliente.
--
-- **Não havia onde guardar o valor da venda.** Mandar a conversão de venda sem
-- valor é possível, e inútil: o motivo de existir importação offline é o
-- Google otimizar por receita em vez de por volume de lead.

-- 1. A captura passa a gravar os identificadores de clique.
CREATE OR REPLACE FUNCTION public.quiz_capture_lead(
  p_quiz_id uuid,
  p_session_id text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_score integer DEFAULT 0,
  p_temperature text DEFAULT 'cold',
  p_tracking jsonb DEFAULT '{}'::jsonb,
  p_responses jsonb DEFAULT '{}'::jsonb,
  p_submission_id uuid DEFAULT NULL,
  p_completed boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_default_stage text;
  v_stage_id uuid;
  v_lead_id uuid;
BEGIN
  IF (coalesce(btrim(p_email), '') = '' AND coalesce(btrim(p_phone), '') = '') THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(p_session_id), '') = '' THEN
    RAISE EXCEPTION 'session_id obrigatório';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || ':' || p_session_id, 0));

  SELECT q.company_id, q.settings->>'default_stage_id'
    INTO v_company_id, v_default_stage
    FROM quiz_funnels q
   WHERE q.id = p_quiz_id
     AND q.status = 'published';

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_stage_id := resolve_entry_stage(v_company_id, nullif(v_default_stage, '')::uuid);

  SELECT l.id INTO v_lead_id
    FROM leads l
   WHERE l.quiz_id = p_quiz_id
     AND l.metadata->>'session_id' = p_session_id
   LIMIT 1;

  IF v_lead_id IS NULL THEN
    v_lead_id := gen_random_uuid();
    INSERT INTO leads (
      id, company_id, quiz_id, name, email, phone, source, status,
      stage_id, stage_entered_at, board_order, score, temperature,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      gclid, fbclid, landing_page, referrer, metadata
    ) VALUES (
      v_lead_id, v_company_id, p_quiz_id,
      nullif(btrim(p_name), ''), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
      'Alt Quiz', 'new',
      v_stage_id, now(), -extract(epoch FROM now()) * 1000,
      p_score, p_temperature,
      p_tracking->>'utm_source', p_tracking->>'utm_medium', p_tracking->>'utm_campaign',
      p_tracking->>'utm_content', p_tracking->>'utm_term',
      nullif(p_tracking->>'gclid', ''), nullif(p_tracking->>'fbclid', ''),
      nullif(p_tracking->>'landing_page', ''), nullif(p_tracking->>'referrer', ''),
      jsonb_build_object(
        'quiz_id', p_quiz_id,
        'session_id', p_session_id,
        'submission_id', p_submission_id,
        'responses', p_responses,
        'quiz_completed', p_completed
      )
    );
  ELSE
    -- O clique só aparece uma vez, na primeira visita. Numa segunda chamada
    -- da mesma sessão ele pode vir vazio — `coalesce` impede que a captura
    -- antecipada, ao ser completada, apague a atribuição que já tinha.
    UPDATE leads SET
      name        = coalesce(nullif(btrim(p_name), ''),  name),
      email       = coalesce(nullif(btrim(p_email), ''), email),
      phone       = coalesce(nullif(btrim(p_phone), ''), phone),
      score       = greatest(coalesce(score, 0), coalesce(p_score, 0)),
      temperature = coalesce(p_temperature, temperature),
      gclid       = coalesce(gclid, nullif(p_tracking->>'gclid', '')),
      fbclid      = coalesce(fbclid, nullif(p_tracking->>'fbclid', '')),
      metadata    = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                      'submission_id', coalesce(p_submission_id, (metadata->>'submission_id')::uuid),
                      'responses', coalesce(metadata->'responses', '{}'::jsonb) || coalesce(p_responses, '{}'::jsonb),
                      'quiz_completed',
                        coalesce((metadata->>'quiz_completed')::boolean, false) OR coalesce(p_completed, false)
                    ),
      updated_at  = now()
    WHERE id = v_lead_id;
  END IF;

  RETURN v_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.quiz_capture_lead(uuid, text, text, text, text, integer, text, jsonb, jsonb, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_capture_lead(uuid, text, text, text, text, integer, text, jsonb, jsonb, uuid, boolean) TO anon, authenticated;

-- 2. Valor da venda, para a conversão de fechamento ter o que informar.
--
-- `numeric(14,2)` e não float: dinheiro em ponto flutuante acumula centavo
-- errado, e este número vai virar receita declarada numa plataforma de mídia.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deal_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS deal_currency text NOT NULL DEFAULT 'BRL';
