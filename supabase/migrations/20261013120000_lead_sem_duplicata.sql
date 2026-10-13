-- Deduplicação de lead por contato, não só por sessão.
--
-- MEDIDO em 13/10/2026, nesta base: 560 leads, 27 grupos de e-mail repetido,
-- 28 linhas excedentes — 5% do CRM é a mesma pessoa contada duas ou três
-- vezes, com até 3 cópias do mesmo contato.
--
-- A causa: `quiz_capture_lead` procurava lead existente SÓ por
-- `quiz_id` + `session_id`. Quem responde de novo noutro dia, ou responde um
-- segundo quiz, nasce como lead novo. Duplicata não é ruído de contagem — é o
-- vendedor ligando para quem outro vendedor já ligou, e a mesma pessoa
-- recebendo a mesma automação duas vezes.
--
-- ATENÇÃO, para quem for aplicar: esta migração altera o caminho de captura de
-- lead, que é o mais crítico do produto. Ela NÃO foi executada contra banco
-- nenhum — foi escrita a partir da definição atual da função, lida em
-- produção. Aplique primeiro em ambiente de teste e confira uma captura
-- completa antes de levar para produção.

-- 1) Telefone comparável, com a MESMA regra do TypeScript.
--
-- Casar por "últimos 10 dígitos" seria mais simples e estaria errado:
-- 11 99999-8888 (SP) e 21 99999-8888 (RJ) terminam iguais nos últimos 10 e são
-- pessoas diferentes. A regra segue a estrutura do número: tira zero de
-- operadora, tira o 55 do país quando ainda sobra número plausível, e aceita
-- 10 dígitos (fixo) ou 11 (celular com nono dígito). Fora disso devolve NULL,
-- e NULL não casa com nada — na dúvida ficam dois leads, que dá para juntar
-- depois. Juntar duas pessoas diferentes perde o contato de uma e não tem
-- desfazer.
--
-- Esta regra vive em dois lugares: aqui e em
-- `src/modules/crm/lib/identidadeDoLead.ts`. Mexeu num, mexa no outro.
CREATE OR REPLACE FUNCTION public.normalizar_telefone_br(p_valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH somente_digitos AS (
    SELECT ltrim(regexp_replace(coalesce(p_valor, ''), '\D', '', 'g'), '0') AS v
  ),
  sem_pais AS (
    SELECT CASE
             WHEN length(v) > 11 AND left(v, 2) = '55' THEN ltrim(substr(v, 3), '0')
             ELSE v
           END AS v
      FROM somente_digitos
  )
  SELECT CASE WHEN length(v) IN (10, 11) THEN v ELSE NULL END FROM sem_pais;
$$;

-- 2) Índices para a busca não varrer a tabela a cada captura.
CREATE INDEX IF NOT EXISTS leads_empresa_email_idx
  ON public.leads (company_id, lower(btrim(email)))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_empresa_telefone_idx
  ON public.leads (company_id, public.normalizar_telefone_br(phone))
  WHERE phone IS NOT NULL;

-- 3) A busca por contato entra DEPOIS da busca por sessão, e só quando ela
--    não achou nada. A ordem importa: dentro da mesma sessão o lead certo é o
--    daquela sessão, mesmo que o visitante tenha digitado o e-mail de outra
--    pessoa.
--
--    O lead MAIS ANTIGO ganha: ele já pode ter responsável, etapa e histórico,
--    e trazer a resposta nova para ele preserva tudo isso. O ramo de UPDATE
--    que já existia enriquece o lead com `coalesce`, então nada do que estava
--    lá é apagado.
CREATE OR REPLACE FUNCTION public.quiz_capture_lead(
  p_quiz_id uuid,
  p_session_id text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_name text DEFAULT NULL::text,
  p_score integer DEFAULT 0,
  p_temperature text DEFAULT 'cold'::text,
  p_tracking jsonb DEFAULT '{}'::jsonb,
  p_responses jsonb DEFAULT '{}'::jsonb,
  p_submission_id uuid DEFAULT NULL::uuid,
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
  v_email_norm text;
  v_fone_norm text;
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

  -- Mesma pessoa, outra sessão ou outro quiz.
  IF v_lead_id IS NULL THEN
    v_email_norm := nullif(lower(btrim(coalesce(p_email, ''))), '');
    v_fone_norm  := public.normalizar_telefone_br(p_phone);

    IF v_email_norm IS NOT NULL OR v_fone_norm IS NOT NULL THEN
      SELECT l.id INTO v_lead_id
        FROM leads l
       WHERE l.company_id = v_company_id
         AND (
              (v_email_norm IS NOT NULL AND lower(btrim(l.email)) = v_email_norm)
           OR (v_fone_norm  IS NOT NULL AND public.normalizar_telefone_br(l.phone) = v_fone_norm)
         )
       ORDER BY l.created_at ASC
       LIMIT 1;
    END IF;
  END IF;

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
    --
    -- Quando o lead veio da busca por CONTATO, este mesmo `coalesce` é o que
    -- garante que a resposta nova enriquece sem sobrescrever: nome, e-mail e
    -- telefone já preenchidos ficam, e o que faltava entra.
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
                        coalesce((metadata->>'quiz_completed')::boolean, false) OR coalesce(p_completed, false),
                      -- A sessão nova fica registrada ao lado da original: sem
                      -- isto, a próxima chamada DESTA sessão não acharia o lead
                      -- pela sessão e cairia de novo na busca por contato.
                      'session_id', coalesce(metadata->>'session_id', p_session_id),
                      'sessoes', coalesce(metadata->'sessoes', '[]'::jsonb) || to_jsonb(p_session_id)
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
