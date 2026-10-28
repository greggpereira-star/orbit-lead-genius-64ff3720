-- Horário do contato informado à mão.
--
-- O registro de contato gravava só o horário do clique. Quem liga às 9h e registra às 11h fazia o
-- indicador contar 2 h a mais. Agora o contato tem DOIS horários:
--   * `contatado_em`: quando o contato aconteceu (informado, ou o do clique se nada for dito);
--   * `created_at`:   quando foi registrado — fixado pelo servidor, ninguém edita.
-- O tempo de resposta usa `contatado_em`. Para o informado à mão não virar número que cada um
-- ajusta, a tabela segue só de acréscimo, o horário informado precisa ser:
--   * DEPOIS da chegada do lead (contato antes de o lead existir não faz sentido);
--   * NÃO no futuro (tolerância de 1 min para relógio desencontrado);
-- e o indicador diz quantos respondidos usaram horário informado (registrado mais de 5 min depois).

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS contatado_em timestamptz;
UPDATE public.lead_contacts SET contatado_em = created_at WHERE contatado_em IS NULL;
ALTER TABLE public.lead_contacts ALTER COLUMN contatado_em SET NOT NULL;
ALTER TABLE public.lead_contacts ALTER COLUMN contatado_em SET DEFAULT now();

-- A assinatura muda (parâmetro e coluna novos): sai a antiga para não sobrar sobrecarga ambígua.
DROP FUNCTION IF EXISTS public.registrar_contato(uuid, text);

CREATE FUNCTION public.registrar_contato(p_lead_id uuid, p_canal text, p_quando timestamptz DEFAULT NULL)
RETURNS TABLE (id uuid, canal text, author_name text, created_at timestamptz, contatado_em timestamptz, repetido boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa  uuid;
  v_chegada  timestamptz;
  v_nome     text;
  v_quando   timestamptz;
  v_existente public.lead_contacts%ROWTYPE;
  v_novo      public.lead_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'é preciso estar autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('whatsapp', 'ligacao', 'email', 'presencial', 'outro') THEN
    RAISE EXCEPTION 'canal inválido' USING ERRCODE = '22023';
  END IF;

  SELECT l.company_id, l.created_at INTO v_empresa, v_chegada FROM public.leads l WHERE l.id = p_lead_id;
  IF v_empresa IS NULL OR NOT public.pode_escrever_na_empresa(v_empresa) THEN
    RAISE EXCEPTION 'sem permissão para registrar contato neste lead' USING ERRCODE = '42501';
  END IF;

  v_quando := coalesce(p_quando, now());
  IF v_quando > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'o horário do contato não pode estar no futuro' USING ERRCODE = '22023';
  END IF;
  IF v_quando < v_chegada THEN
    RAISE EXCEPTION 'o horário do contato é anterior à chegada do lead' USING ERRCODE = '22023';
  END IF;
  v_quando := least(v_quando, now());

  SELECT * INTO v_existente
    FROM public.lead_contacts c
   WHERE c.lead_id = p_lead_id
     AND c.author_id = auth.uid()
     AND c.canal = p_canal
     AND c.created_at > now() - interval '60 seconds'
     AND abs(extract(epoch FROM (c.contatado_em - v_quando))) < 60
   ORDER BY c.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.canal, v_existente.author_name,
                        v_existente.created_at, v_existente.contatado_em, true;
    RETURN;
  END IF;

  SELECT coalesce(nullif(btrim(p.full_name), ''), p.email) INTO v_nome
    FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.lead_contacts (company_id, lead_id, canal, author_id, author_name, contatado_em)
  VALUES (v_empresa, p_lead_id, p_canal, auth.uid(), v_nome, v_quando)
  RETURNING * INTO v_novo;

  RETURN QUERY SELECT v_novo.id, v_novo.canal, v_novo.author_name, v_novo.created_at, v_novo.contatado_em, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_contato(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contato(uuid, text, timestamptz) TO authenticated, service_role;

-- Tempo de resposta: o contato vale pelo horário em que aconteceu, e a função diz quantos
-- respondidos usaram horário informado à mão.
DROP FUNCTION IF EXISTS public.tempo_de_resposta(uuid, timestamptz);

CREATE FUNCTION public.tempo_de_resposta(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  leads_total bigint,
  com_conversa bigint,
  respondidos bigint,
  mediana_segundos numeric,
  p90_segundos numeric,
  ate_5min bigint,
  ate_1h bigint,
  ate_24h bigint,
  so_automacao bigint,
  sem_resposta bigint,
  esperando_agora bigint,
  espera_mais_antiga_segundos numeric,
  medidos bigint,
  com_contato_registrado bigint,
  respondidos_manual bigint,
  respondidos_retroativos bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);

  WITH msgs AS (
    SELECT
      c.lead_id,
      m.direction,
      m.origin,
      m.status,
      coalesce(m.provider_ts, m.created_at) AS quando
    FROM public.wa_conversations c
    JOIN public.wa_messages m ON m.conversation_id = c.id
    JOIN public.leads l ON l.id = c.lead_id
    WHERE c.company_id = p_company_id
      AND l.company_id = p_company_id
      AND l.created_at >= p_desde
  ),
  contatos AS (
    SELECT k.lead_id,
           min(k.contatado_em) AS primeiro,
           (array_agg(k.created_at ORDER BY k.contatado_em))[1] AS registrado_em
      FROM public.lead_contacts k
      JOIN public.leads l ON l.id = k.lead_id
     WHERE k.company_id = p_company_id
       AND l.company_id = p_company_id
       AND l.created_at >= p_desde
     GROUP BY k.lead_id
  ),
  por_lead AS (
    SELECT
      l.id,
      least(
        l.created_at,
        (SELECT min(m.quando) FROM msgs m
          WHERE m.lead_id = l.id AND m.direction = 'inbound' AND m.origin = 'customer')
      ) AS inicio,
      (SELECT min(x.quando) FROM msgs x
        WHERE x.lead_id = l.id
          AND x.direction = 'outbound'
          AND x.origin IN ('agent', 'app_echo')
          AND x.status <> 'failed') AS primeira_whatsapp,
      (SELECT c.primeiro FROM contatos c WHERE c.lead_id = l.id) AS primeira_manual,
      (SELECT c.registrado_em FROM contatos c WHERE c.lead_id = l.id) AS registrado_em,
      EXISTS (SELECT 1 FROM msgs a
               WHERE a.lead_id = l.id AND a.origin = 'automation'
                 AND a.direction = 'outbound' AND a.status <> 'failed') AS houve_automacao,
      EXISTS (SELECT 1 FROM msgs a WHERE a.lead_id = l.id) AS tem_conversa
    FROM public.leads l
    WHERE l.company_id = p_company_id
      AND l.created_at >= p_desde
      AND (EXISTS (SELECT 1 FROM msgs a WHERE a.lead_id = l.id)
           OR EXISTS (SELECT 1 FROM contatos c WHERE c.lead_id = l.id))
  ),
  medido AS (
    SELECT
      id,
      tem_conversa,
      primeira_manual IS NOT NULL AS tem_contato,
      houve_automacao,
      -- LEAST ignora NULL: vale a menor das duas, ou a que existir.
      CASE WHEN least(primeira_whatsapp, primeira_manual) >= inicio
           THEN extract(epoch FROM (least(primeira_whatsapp, primeira_manual) - inicio)) END AS segundos,
      (primeira_manual IS NOT NULL
        AND (primeira_whatsapp IS NULL OR primeira_manual <= primeira_whatsapp)
        AND primeira_manual >= inicio) AS veio_do_registro,
      -- Horário informado à mão: o contato foi registrado mais de 5 min depois de acontecer.
      (primeira_manual IS NOT NULL AND registrado_em - primeira_manual > interval '5 minutes') AS retroativo
    FROM por_lead
  ),
  -- Estado de agora, por conversa: a mensagem mais antiga do cliente que ainda não teve
  -- resposta de alguém da equipe depois dela. (Contato registrado não encerra a espera: quem
  -- fecha a espera é a resposta na própria conversa.)
  fila AS (
    SELECT
      c.id,
      (
        SELECT min(coalesce(i.provider_ts, i.created_at))
          FROM public.wa_messages i
         WHERE i.conversation_id = c.id
           AND i.direction = 'inbound'
           AND i.origin = 'customer'
           AND coalesce(i.provider_ts, i.created_at) > coalesce((
                 SELECT max(coalesce(o.provider_ts, o.created_at))
                   FROM public.wa_messages o
                  WHERE o.conversation_id = c.id
                    AND o.direction = 'outbound'
                    AND o.origin IN ('agent', 'app_echo')
                    AND o.status <> 'failed'
               ), '-infinity'::timestamptz)
      ) AS desde_quando
    FROM public.wa_conversations c
    WHERE c.company_id = p_company_id
      AND c.status <> 'resolved'
  )
  SELECT
    (SELECT count(*) FROM public.leads l WHERE l.company_id = p_company_id AND l.created_at >= p_desde),
    (SELECT count(*) FROM medido WHERE tem_conversa),
    (SELECT count(*) FROM medido WHERE segundos IS NOT NULL),
    (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos))::numeric, 0) FROM medido WHERE segundos IS NOT NULL),
    (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY segundos))::numeric, 0) FROM medido WHERE segundos IS NOT NULL),
    (SELECT count(*) FROM medido WHERE segundos <= 300),
    (SELECT count(*) FROM medido WHERE segundos <= 3600),
    (SELECT count(*) FROM medido WHERE segundos <= 86400),
    (SELECT count(*) FROM medido WHERE segundos IS NULL AND houve_automacao),
    (SELECT count(*) FROM medido WHERE segundos IS NULL),
    (SELECT count(*) FROM fila WHERE desde_quando IS NOT NULL),
    (SELECT round(extract(epoch FROM (now() - min(desde_quando)))::numeric, 0) FROM fila WHERE desde_quando IS NOT NULL),
    (SELECT count(*) FROM medido),
    (SELECT count(*) FROM medido WHERE tem_contato),
    (SELECT count(*) FROM medido WHERE segundos IS NOT NULL AND veio_do_registro),
    (SELECT count(*) FROM medido WHERE segundos IS NOT NULL AND veio_do_registro AND retroativo);
$$;

REVOKE ALL ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';
