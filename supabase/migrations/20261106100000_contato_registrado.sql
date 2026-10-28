-- Contato registrado à mão ("contatei").
--
-- Quase todo lead chega por formulário da Meta e é atendido FORA do WhatsApp do sistema
-- (ligação, WhatsApp do celular sem espelho, presencial). Sem conversa ligada ao lead, o tempo
-- de resposta não tinha como medi-lo: em 28/10/2026 cobria 1 de 179 leads. O botão "Registrar
-- contato" no lead grava que a equipe falou com a pessoa, e o tempo de resposta passa a contar
-- esse registro como primeira resposta.
--
-- Regras desta tabela:
--   * SÓ ACRESCENTA. Não há política de INSERT/UPDATE/DELETE para o app: quem grava é a função
--     `registrar_contato`, e ninguém edita ou apaga um registro depois (senão o indicador de
--     atendimento vira um número que cada um ajusta). Apagar o lead leva os registros junto
--     (ON DELETE CASCADE), que é o que a eliminação de dados do titular precisa.
--   * O HORÁRIO É O DO SERVIDOR, no momento do clique. Não dá para informar "contatei ontem às
--     9h": o registro tardio aparece tardio, e a tela diz isso.
--   * Autor vem de auth.uid(), não de parâmetro.
--   * Visualizador nunca registra (pode_escrever_na_empresa).
--   * Dois cliques do mesmo autor, no mesmo lead e canal, em menos de 60 s valem um registro só.

CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  canal       text NOT NULL CHECK (canal IN ('whatsapp', 'ligacao', 'email', 'presencial', 'outro')),
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_contacts_lead_idx ON public.lead_contacts (lead_id, created_at);
CREATE INDEX IF NOT EXISTS lead_contacts_empresa_idx ON public.lead_contacts (company_id, created_at);

ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem contatos da empresa" ON public.lead_contacts;
CREATE POLICY "Membros leem contatos da empresa" ON public.lead_contacts
  FOR SELECT TO authenticated
  USING (public.check_membership(company_id));

-- Sem GRANT de escrita: nem a política nem o privilégio existem para o app gravar direto.
REVOKE ALL ON public.lead_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_contacts TO authenticated;
GRANT ALL ON public.lead_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_contato(p_lead_id uuid, p_canal text)
RETURNS TABLE (id uuid, canal text, author_name text, created_at timestamptz, repetido boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_nome    text;
  v_existente public.lead_contacts%ROWTYPE;
  v_novo      public.lead_contacts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'é preciso estar autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('whatsapp', 'ligacao', 'email', 'presencial', 'outro') THEN
    RAISE EXCEPTION 'canal inválido' USING ERRCODE = '22023';
  END IF;

  SELECT l.company_id INTO v_empresa FROM public.leads l WHERE l.id = p_lead_id;
  IF v_empresa IS NULL OR NOT public.pode_escrever_na_empresa(v_empresa) THEN
    RAISE EXCEPTION 'sem permissão para registrar contato neste lead' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existente
    FROM public.lead_contacts c
   WHERE c.lead_id = p_lead_id
     AND c.author_id = auth.uid()
     AND c.canal = p_canal
     AND c.created_at > now() - interval '60 seconds'
   ORDER BY c.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.canal, v_existente.author_name,
                        v_existente.created_at, true;
    RETURN;
  END IF;

  SELECT coalesce(nullif(btrim(p.full_name), ''), p.email) INTO v_nome
    FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.lead_contacts (company_id, lead_id, canal, author_id, author_name)
  VALUES (v_empresa, p_lead_id, p_canal, auth.uid(), v_nome)
  RETURNING * INTO v_novo;

  RETURN QUERY SELECT v_novo.id, v_novo.canal, v_novo.author_name, v_novo.created_at, false;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_contato(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contato(uuid, text) TO authenticated, service_role;

-- Tempo de resposta passa a contar o contato registrado. A assinatura de retorno muda (colunas
-- novas), então não dá para CREATE OR REPLACE.
--
-- Primeira resposta = o que vier primeiro entre (a) a 1ª mensagem de saída de alguém da equipe
-- no WhatsApp e (b) o 1º contato registrado. Mensagem de automação segue não contando.
-- `medidos` = leads com conversa OU com contato registrado. `com_conversa` continua sendo só os
-- que têm conversa; `respondidos_manual` diz quantos dos respondidos foram medidos pelo registro.
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
  respondidos_manual bigint
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
    SELECT k.lead_id, min(k.created_at) AS primeiro
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
        AND primeira_manual >= inicio) AS veio_do_registro
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
    (SELECT count(*) FROM medido WHERE segundos IS NOT NULL AND veio_do_registro);
$$;

REVOKE ALL ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tempo_de_resposta(uuid, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
