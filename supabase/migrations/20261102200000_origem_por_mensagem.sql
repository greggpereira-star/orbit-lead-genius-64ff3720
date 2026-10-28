-- Origem do lead por canal, regras por mensagem e painel de "não rastreado".
--
-- Hoje `leads.source` é texto livre ("facebook", "Alt Quiz", "WhatsApp", "manual"…) e
-- não dá para responder "quantos leads não sabemos de onde vieram". Aqui:
--
--  1. `canal_do_lead(lead)` DERIVA um canal de uma lista fixa a partir do que o banco
--     já tem (clique, gclid, anúncio da Meta, UTM…). Nada novo é gravado para isso, e
--     por isso a conta nunca diverge dos dados.
--  2. `leads.origem_canal` guarda um canal ATRIBUÍDO por regra de mensagem ou pela
--     equipe, só para o que o banco não consegue provar sozinho.
--  3. Regra de ordem: a PROVA de anúncio (gclid, ctwa, anúncio da Meta, link
--     rastreado) sempre vence o canal atribuído. Uma regra de texto ("vim pelo
--     Instagram") nunca troca uma atribuição comprovada.

-- ---------------------------------------------------------------------------
-- 1. Colunas e regras
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origem_canal text,
  ADD COLUMN IF NOT EXISTS origem_canal_por text;

-- Canais que a equipe ou uma regra podem ATRIBUIR. Os demais são só derivados.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_origem_canal_valida;
ALTER TABLE public.leads ADD CONSTRAINT leads_origem_canal_valida CHECK (
  origem_canal IS NULL OR origem_canal IN (
    'meta_anuncio', 'google_anuncio', 'instagram_organico', 'site_organico',
    'indicacao', 'whatsapp_direto', 'presencial', 'outro'
  )
);

CREATE TABLE IF NOT EXISTS public.origin_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  padrao     text NOT NULL CHECK (char_length(btrim(padrao)) BETWEEN 2 AND 80),
  canal      text NOT NULL CHECK (canal IN (
               'meta_anuncio', 'google_anuncio', 'instagram_organico', 'site_organico',
               'indicacao', 'whatsapp_direto', 'presencial', 'outro')),
  ativa      boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 100,
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS origin_rules_empresa ON public.origin_rules (company_id, prioridade, criada_em);

ALTER TABLE public.origin_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS origin_rules_leitura ON public.origin_rules;
CREATE POLICY origin_rules_leitura ON public.origin_rules
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

REVOKE ALL ON public.origin_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.origin_rules TO authenticated;
GRANT ALL ON public.origin_rules TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Texto comparável: minúsculas, sem acento, espaços colapsados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_texto(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
              'áàâãäéèêëíìîïóòôõöúùûüçñ',
              'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- 3. Canal derivado
-- ---------------------------------------------------------------------------
-- Ordem = força da prova. Do mais ao menos comprovado:
--   google_anuncio   gclid/wbraid/gbraid no lead ou num clique ligado a ele
--   whatsapp_anuncio clique Click-to-WhatsApp (ctwa) ou anúncio guardado no lead
--   meta_anuncio     anúncio/formulário da Meta, fbclid, ou UTM de mídia paga da Meta
--   link_rastreado   clique em link de redirecionamento da empresa
--   (atribuído)      `origem_canal`, definido por regra de mensagem ou pela equipe
--   quiz / formulario / api   canais próprios (conhecidos, sem campanha de anúncio)
--   utm_outro        tem UTM que não reconhecemos como anúncio
--   nao_rastreado    nada acima: "WhatsApp" sem clique, cadastro manual, sem origem
CREATE OR REPLACE FUNCTION public.canal_do_lead(l public.leads)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN l.gclid IS NOT NULL OR l.wbraid IS NOT NULL OR l.gbraid IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.whatsapp_ad_clicks c WHERE c.lead_id = l.id AND c.gclid IS NOT NULL)
      THEN 'google_anuncio'
    WHEN EXISTS (SELECT 1 FROM public.whatsapp_ad_clicks c WHERE c.lead_id = l.id AND c.origem = 'ctwa')
      OR l.metadata ? 'whatsapp_ad'
      THEN 'whatsapp_anuncio'
    WHEN l.metadata ? 'meta_ad_id' OR l.metadata ? 'meta_leadgen_id' OR l.fbclid IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.whatsapp_ad_clicks c WHERE c.lead_id = l.id AND c.fbclid IS NOT NULL)
      OR (lower(coalesce(l.utm_source, '')) IN ('facebook', 'instagram', 'meta', 'fb', 'ig')
          AND lower(coalesce(l.utm_medium, '')) ~ '(paid|cpc|ppc|ads)')
      THEN 'meta_anuncio'
    WHEN EXISTS (SELECT 1 FROM public.whatsapp_ad_clicks c WHERE c.lead_id = l.id AND c.origem = 'redirect')
      THEN 'link_rastreado'
    WHEN l.origem_canal IS NOT NULL THEN l.origem_canal
    WHEN l.quiz_id IS NOT NULL OR l.source ILIKE 'alt quiz%' THEN 'quiz'
    WHEN l.source ILIKE 'alt formul%' THEN 'formulario'
    WHEN l.metadata ->> 'origem' = 'api' THEN 'api'
    WHEN l.utm_source IS NOT NULL THEN 'utm_outro'
    ELSE 'nao_rastreado'
  END;
$$;

REVOKE ALL ON FUNCTION public.canal_do_lead(public.leads) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canal_do_lead(public.leads) TO authenticated, service_role;

-- As primeiras mensagens do CLIENTE (até 3), nas duas pilhas de WhatsApp, em ordem.
CREATE OR REPLACE FUNCTION public.mensagens_iniciais_do_lead(p_lead_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT left(string_agg(x.body, ' / ' ORDER BY x.criada), 400)
    FROM (
      SELECT t.body, t.criada FROM (
        SELECT m.body, m.created_at AS criada
          FROM public.wa_messages m
          JOIN public.wa_conversations c ON c.id = m.conversation_id
         WHERE c.lead_id = p_lead_id AND m.direction = 'inbound' AND m.body IS NOT NULL AND btrim(m.body) <> ''
        UNION ALL
        SELECT w.body, w.created_at
          FROM public.whatsapp_messages w
         WHERE w.lead_id = p_lead_id AND w.direction = 'inbound' AND w.body IS NOT NULL
           AND btrim(w.body) <> '' AND w.body <> '(mídia sem texto)'
      ) t
      ORDER BY t.criada
      LIMIT 3
    ) x;
$$;

REVOKE ALL ON FUNCTION public.mensagens_iniciais_do_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mensagens_iniciais_do_lead(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Painel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.origem_dos_leads(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (canal text, leads bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);
  SELECT public.canal_do_lead(l) AS canal, count(*) AS leads
    FROM public.leads l
   WHERE l.company_id = p_company_id AND l.created_at >= p_desde
   GROUP BY 1
   ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION public.origem_dos_leads(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.origem_dos_leads(uuid, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leads_nao_rastreados(
  p_company_id uuid,
  p_desde timestamptz DEFAULT now() - interval '30 days',
  p_limite integer DEFAULT 50
)
RETURNS TABLE (
  lead_id uuid,
  name text,
  email text,
  phone text,
  source text,
  created_at timestamptz,
  stage_name text,
  mensagens text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exigir_acesso_a_empresa(p_company_id);
  SELECT l.id, l.name, l.email, l.phone, l.source, l.created_at, s.name,
         public.mensagens_iniciais_do_lead(l.id)
    FROM public.leads l
    LEFT JOIN public.stages s ON s.id = l.stage_id
   WHERE l.company_id = p_company_id
     AND l.created_at >= p_desde
     AND public.canal_do_lead(l) = 'nao_rastreado'
   ORDER BY l.created_at DESC
   LIMIT greatest(1, least(p_limite, 200));
$$;

REVOKE ALL ON FUNCTION public.leads_nao_rastreados(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_nao_rastreados(uuid, timestamptz, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Atribuir (manual) e aplicar regras (por mensagem)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_origem_do_lead(p_lead_id uuid, p_canal text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT company_id INTO v_empresa FROM public.leads WHERE id = p_lead_id;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.chamada_de_servidor() AND NOT public.pode_escrever_na_empresa(v_empresa) THEN
    RAISE EXCEPTION 'sem permissão para alterar este lead' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NOT NULL AND p_canal NOT IN (
    'meta_anuncio', 'google_anuncio', 'instagram_organico', 'site_organico',
    'indicacao', 'whatsapp_direto', 'presencial', 'outro'
  ) THEN
    RAISE EXCEPTION 'canal inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads
     SET origem_canal = p_canal,
         origem_canal_por = CASE WHEN p_canal IS NULL THEN NULL ELSE 'manual:' || coalesce(auth.uid()::text, 'servidor') END
   WHERE id = p_lead_id;

  INSERT INTO public.lead_events (lead_id, event_type, description, metadata)
  VALUES (p_lead_id, 'origem_definida',
          CASE WHEN p_canal IS NULL THEN 'Origem atribuída removida.' ELSE 'Origem definida manualmente: ' || p_canal END,
          jsonb_build_object('canal', p_canal, 'por', auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.definir_origem_do_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_origem_do_lead(uuid, text) TO authenticated, service_role;

-- Aplica a PRIMEIRA regra que casa com as primeiras mensagens do cliente. Só atua em
-- lead que hoje é "não rastreado": prova de anúncio ou canal já atribuído nunca é trocado.
CREATE OR REPLACE FUNCTION public.aplicar_regras_de_origem_ao_lead(p_lead_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.leads%ROWTYPE;
  v_texto text;
  r public.origin_rules%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.chamada_de_servidor() AND NOT public.pode_escrever_na_empresa(l.company_id) THEN
    RAISE EXCEPTION 'sem permissão para alterar este lead' USING ERRCODE = '42501';
  END IF;

  IF public.canal_do_lead(l) <> 'nao_rastreado' THEN RETURN NULL; END IF;

  v_texto := public.normalizar_texto(public.mensagens_iniciais_do_lead(p_lead_id));
  IF v_texto = '' THEN RETURN NULL; END IF;

  SELECT * INTO r
    FROM public.origin_rules x
   WHERE x.company_id = l.company_id AND x.ativa
     AND public.normalizar_texto(x.padrao) <> ''
     AND position(public.normalizar_texto(x.padrao) IN v_texto) > 0
   ORDER BY x.prioridade, x.criada_em
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.leads SET origem_canal = r.canal, origem_canal_por = 'regra:' || r.id WHERE id = p_lead_id;
  INSERT INTO public.lead_events (lead_id, event_type, description, metadata)
  VALUES (p_lead_id, 'origem_por_regra', 'Origem definida pela regra "' || r.padrao || '": ' || r.canal,
          jsonb_build_object('regra_id', r.id, 'canal', r.canal));
  RETURN r.canal;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_regras_de_origem_ao_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_regras_de_origem_ao_lead(uuid) TO authenticated, service_role;

-- Em lote, para quem já está na base. Só dono/administrador (ou o servidor).
CREATE OR REPLACE FUNCTION public.aplicar_regras_de_origem(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_n integer := 0;
BEGIN
  IF NOT public.chamada_de_servidor() AND NOT public.eh_admin_da_empresa(p_company_id) THEN
    RAISE EXCEPTION 'apenas dono ou administrador' USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT l.id FROM public.leads l
     WHERE l.company_id = p_company_id AND public.canal_do_lead(l) = 'nao_rastreado'
     ORDER BY l.created_at DESC
     LIMIT 1000
  LOOP
    IF public.aplicar_regras_de_origem_ao_lead(v_id) IS NOT NULL THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_regras_de_origem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_regras_de_origem(uuid) TO authenticated, service_role;
