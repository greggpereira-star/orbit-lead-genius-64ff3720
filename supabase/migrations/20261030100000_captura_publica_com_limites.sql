-- Captura pública com limites: revisão das funções que o visitante anônimo executa.
--
-- Medido em produção (transação desfeita), antes desta migration:
--   * o visitante anônimo inseria direto em `leads` (política "Public lead capture"), com qualquer
--     campo forjado, sem passar por formulário; idem em `whatsapp_click_events` (política `true`).
--     Nenhum código legítimo usa esses caminhos: o formulário e o quiz gravam por função
--     SECURITY DEFINER, e o clique do WhatsApp grava pelo servidor (service_role).
--   * as três funções públicas aceitavam payloads de MB (3,5 MB passou) e 300 rascunhos em 0,07 s;
--   * `quiz_capture_lead` gravava nota, temperatura e etiquetas exatamente como o navegador mandou.
--
-- O que muda:
--   1. anon perde INSERT em `leads` e `whatsapp_click_events` (e as duas políticas saem);
--   2. `form_submit_publico`, `form_rascunho_salvar` e `quiz_capture_lead` recusam payload grande
--      (limites folgados: o maior dado real hoje é ~1,7 KB);
--   3. `quiz_capture_lead` limita a nota, aceita só cold/warm/hot e corta etiquetas (15, até 60 letras).
--
-- Cada função é alterada sobre a definição real, com asserção: se o ponto de inserção não existir,
-- a migration inteira é abortada.

-- 1. Escrita direta anônima fechada.
DROP POLICY IF EXISTS "Public lead capture" ON public.leads;
DROP POLICY IF EXISTS "anon can insert whatsapp clicks" ON public.whatsapp_click_events;
REVOKE INSERT ON public.leads FROM anon;
REVOKE INSERT ON public.whatsapp_click_events FROM anon;

-- 2. Verificador de tamanho (chamado de dentro das funções DEFINER).
CREATE OR REPLACE FUNCTION public.captura_dentro_do_limite(
  p_corpo jsonb, p_extra jsonb, p_textos text[]
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
BEGIN
  IF octet_length(coalesce(p_corpo, '{}'::jsonb)::text) > 65536
     OR octet_length(coalesce(p_extra, '{}'::jsonb)::text) > 16384 THEN
    RAISE EXCEPTION 'payload_grande' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_corpo) = 'object' AND EXISTS (
       SELECT 1 FROM jsonb_each(p_corpo) e WHERE length(e.value::text) > 5000) THEN
    RAISE EXCEPTION 'campo_grande' USING ERRCODE = '22023';
  END IF;
  FOREACH t IN ARRAY coalesce(p_textos, '{}'::text[]) LOOP
    IF length(coalesce(t, '')) > 500 THEN
      RAISE EXCEPTION 'campo_grande' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.captura_dentro_do_limite(jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.captura_dentro_do_limite(jsonb, jsonb, text[]) TO service_role;

DO $$
DECLARE
  r record;
  def text;
  nova text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('form_submit_publico',  'PERFORM public.captura_dentro_do_limite(p_answers, p_tracking, ARRAY[p_slug, p_session_id, p_event_id]);'),
    ('form_rascunho_salvar', 'PERFORM public.captura_dentro_do_limite(p_answers, p_tracking, ARRAY[p_slug, p_session_id, p_visitor_id]);')
  ) AS t(fn, guarda)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn;
    IF def IS NULL THEN RAISE EXCEPTION 'função % não encontrada', r.fn; END IF;
    nova := regexp_replace(def, '\mbegin\M', E'begin\n  ' || r.guarda, 'i');
    IF nova = def THEN RAISE EXCEPTION 'ponto de inserção não encontrado em %', r.fn; END IF;
    EXECUTE nova;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'quiz_capture_lead';
  IF def IS NULL THEN RAISE EXCEPTION 'quiz_capture_lead não encontrada'; END IF;
  nova := regexp_replace(def, '\mBEGIN\M', E'BEGIN\n'
    || E'  PERFORM public.captura_dentro_do_limite(p_responses, p_tracking, ARRAY[p_session_id, p_email, p_phone, p_name]);\n'
    || E'  p_score := least(greatest(coalesce(p_score, 0), 0), 1000);\n'
    || E'  IF p_temperature IS NULL OR p_temperature NOT IN (''cold'', ''warm'', ''hot'') THEN p_temperature := ''cold''; END IF;\n');
  IF nova = def THEN RAISE EXCEPTION 'ponto de inserção não encontrado em quiz_capture_lead'; END IF;
  def := nova;
  nova := replace(def, 'FROM unnest(p_tags) AS t', 'FROM unnest(p_tags[1:15]) AS t');
  IF nova = def THEN RAISE EXCEPTION 'unnest de etiquetas não encontrado'; END IF;
  def := nova;
  nova := replace(def, $q$WHERE coalesce(btrim(t), '') <> ''$q$, $q$WHERE coalesce(btrim(t), '') <> '' AND length(t) <= 60$q$);
  IF nova = def THEN RAISE EXCEPTION 'filtro de etiquetas não encontrado'; END IF;
  EXECUTE nova;
END $$;
