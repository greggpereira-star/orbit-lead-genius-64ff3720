-- Captura antecipada: o lead nasce quando o contato é preenchido, não no
-- último clique.
--
-- Antes, quem digitava o e-mail e fechava a página antes da tela final
-- simplesmente sumia — e é justamente esse visitante que vale recuperar por
-- e-mail depois. Agora o lead é gravado assim que o contato aparece, e a
-- conclusão do quiz apenas COMPLETA o mesmo lead.
--
-- Por que uma função e não insert direto:
--   O visitante do quiz é anônimo. Para ele atualizar o lead que criou,
--   seria preciso uma política de UPDATE para `anon` — e como anônimo não tem
--   identidade, essa política liberaria atualizar QUALQUER lead da base. A
--   função roda com os privilégios do dono, expõe só a forma que interessa, e
--   decide sozinha o que pode mudar.
--
-- Duas travas que a função impõe e o cliente não poderia impor:
--   1. `company_id` é DERIVADO do quiz. O cliente não manda — logo não tem
--      como plantar lead na empresa de outro assinante.
--   2. O quiz precisa estar publicado. Sem isso, um rascunho viraria porta de
--      entrada para encher a base de lixo.

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
  -- Sem contato não há lead. Quem só navegou fica registrado na submissão.
  IF (coalesce(btrim(p_email), '') = '' AND coalesce(btrim(p_phone), '') = '') THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(p_session_id), '') = '' THEN
    RAISE EXCEPTION 'session_id obrigatório';
  END IF;

  -- Serializa as chamadas da MESMA sessão. Sem isto, a captura antecipada e a
  -- conclusão podem chegar juntas, as duas consultam antes de qualquer insert,
  -- as duas não acham nada, e a sessão vira dois leads. O bloqueio é por
  -- sessão, não global: sessões diferentes seguem em paralelo. Solta sozinho
  -- no fim da transação.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || ':' || p_session_id, 0));

  SELECT q.company_id, q.settings->>'default_stage_id'
    INTO v_company_id, v_default_stage
    FROM quiz_funnels q
   WHERE q.id = p_quiz_id
     AND q.status = 'published';

  IF v_company_id IS NULL THEN
    RETURN NULL; -- quiz inexistente ou não publicado
  END IF;

  v_stage_id := resolve_entry_stage(v_company_id, nullif(v_default_stage, '')::uuid);

  -- Mesma sessão = mesmo lead. É isto que impede a conclusão de criar um
  -- segundo lead para quem já tinha sido capturado no meio do caminho.
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
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, metadata
    ) VALUES (
      v_lead_id, v_company_id, p_quiz_id,
      nullif(btrim(p_name), ''), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
      'Alt Quiz', 'new',
      v_stage_id, now(), -extract(epoch FROM now()) * 1000,
      p_score, p_temperature,
      p_tracking->>'utm_source', p_tracking->>'utm_medium', p_tracking->>'utm_campaign',
      p_tracking->>'utm_content', p_tracking->>'utm_term',
      jsonb_build_object(
        'quiz_id', p_quiz_id,
        'session_id', p_session_id,
        'submission_id', p_submission_id,
        'responses', p_responses,
        'quiz_completed', p_completed
      )
    );
  ELSE
    -- Só ACRESCENTA. Um contato já gravado nunca é apagado por uma chamada
    -- posterior que venha sem ele — a segunda passada existe para completar,
    -- não para desfazer. A etapa também não é tocada: se o time já moveu o
    -- lead no pipeline, concluir o quiz não pode puxá-lo de volta.
    --
    -- Duas chamadas da mesma sessão podem chegar fora de ordem. Por isso nada
    -- aqui é substituição: respostas se somam e `quiz_completed` só sobe. Uma
    -- captura antecipada atrasada não pode apagar respostas nem desmarcar um
    -- quiz que já foi concluído.
    UPDATE leads SET
      name        = coalesce(nullif(btrim(p_name), ''),  name),
      email       = coalesce(nullif(btrim(p_email), ''), email),
      phone       = coalesce(nullif(btrim(p_phone), ''), phone),
      score       = greatest(coalesce(score, 0), coalesce(p_score, 0)),
      temperature = coalesce(p_temperature, temperature),
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
