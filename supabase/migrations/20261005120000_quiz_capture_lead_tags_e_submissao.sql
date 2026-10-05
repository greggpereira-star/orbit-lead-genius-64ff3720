-- O caminho anônimo do quiz tinha três escritas impossíveis, não uma:
--
--   1. `insert ... returning id` em quiz_submissions. Com RETURNING o Postgres
--      aplica TAMBÉM a política de SELECT, e `anon` não tem nenhuma — daí o
--      42501 que parecia falha do WITH CHECK. Resolvido no cliente, gerando o
--      id antes de inserir e dispensando o retorno.
--   2. `update quiz_submissions set lead_id` — `anon` não tem grant de UPDATE.
--   3. `insert lead_tags` — `anon` não tem grant nenhum na tabela.
--
-- As duas últimas estavam dentro do mesmo try/catch, então a de cima abortava
-- a de baixo e também o roteamento: o lead nascia sem etiqueta, sem vínculo
-- com a submissão e sem responsável, em silêncio. Em vez de dar grants ao
-- anônimo, as escritas passam a acontecer aqui dentro, onde o SECURITY DEFINER
-- já responde pela autorização e o company_id vem do quiz, não do cliente.

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
  p_completed boolean DEFAULT false,
  p_tags text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Vínculo submissão → lead. O `company_id = v_company_id` é o que impede
  -- um cliente de passar o id de uma submissão de outra empresa para
  -- carimbá-la com um lead seu.
  IF p_submission_id IS NOT NULL THEN
    UPDATE quiz_submissions
       SET lead_id = v_lead_id
     WHERE id = p_submission_id
       AND company_id = v_company_id;
  END IF;

  -- Etiquetas da faixa de pontuação. `on conflict` porque a captura antecipada
  -- e a conclusão chamam esta função na mesma sessão, com as mesmas etiquetas.
  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    INSERT INTO lead_tags (lead_id, company_id, tag_name)
    SELECT v_lead_id, v_company_id, t
      FROM unnest(p_tags) AS t
     WHERE coalesce(btrim(t), '') <> ''
    ON CONFLICT (lead_id, tag_name) DO NOTHING;
  END IF;

  RETURN v_lead_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.quiz_capture_lead(
  uuid, text, text, text, text, integer, text, jsonb, jsonb, uuid, boolean, text[]
) TO anon, authenticated;

-- A assinatura de 11 argumentos deixa de existir: mantê-la lado a lado com a
-- de 12 faria o PostgREST escolher por nome de parâmetro e uma chamada sem
-- p_tags cairia silenciosamente na versão velha, sem etiqueta e sem vínculo.
DROP FUNCTION IF EXISTS public.quiz_capture_lead(
  uuid, text, text, text, text, integer, text, jsonb, jsonb, uuid, boolean
);
