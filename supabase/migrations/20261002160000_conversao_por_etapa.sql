-- Conversão por etapa do funil — Fase 2
--
-- A regra do produto: o evento NÃO dispara quando a conversa começa. Dispara
-- quando o lead chega na etapa que aquele nicho considera qualificado. Assim a
-- Meta aprende com quem presta, não com quem só mandou "oi".

-- 1. O mapeamento. É DADO, não código: uma clínica configura "Avaliação
--    agendada", uma imobiliária configura "Visita ao decorado". Mesmo motor.
CREATE TABLE IF NOT EXISTS public.stage_conversion_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,

  -- Nome do evento na Meta. Livre de propósito: além dos padrão, o cliente pode
  -- usar um personalizado e transformá-lo em conversão personalizada lá.
  meta_event_name text,

  -- Nome do recurso da ação de conversão no Google Ads.
  google_conversion_action text,

  -- Manda o valor do negócio junto? Verdadeiro na venda, falso no lead — mandar
  -- valor num evento de lead ensina a Meta a otimizar pela métrica errada.
  send_deal_value boolean NOT NULL DEFAULT false,

  -- A etiqueta espelhada no WhatsApp. Etiqueta e etapa são a MESMA coisa por
  -- decisão de produto: duas portas para um estado só, então um evento só.
  whatsapp_label text,

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Uma etapa dispara no máximo uma configuração. Sem isto, duas linhas para a
  -- mesma etapa virariam dois eventos para a mesma transição.
  UNIQUE (company_id, stage_id)
);

CREATE INDEX IF NOT EXISTS stage_conv_map_label
  ON public.stage_conversion_mappings (company_id, whatsapp_label)
  WHERE whatsapp_label IS NOT NULL;

ALTER TABLE public.stage_conversion_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_conv_map_membro ON public.stage_conversion_mappings;
CREATE POLICY stage_conv_map_membro ON public.stage_conversion_mappings
  FOR ALL USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

-- 2. A fila de disparo, que é também o registro do que foi enviado.
CREATE TABLE IF NOT EXISTS public.conversion_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,

  -- Determinístico por (lead, etapa). É esta coluna que garante "uma transição,
  -- um evento": se o lead voltar para a etapa e avançar de novo, não duplica, e
  -- se o board e a etiqueta dispararem juntos, a segunda esbarra no índice.
  -- O mesmo valor vai como `event_id` para a Meta, que também deduplica do lado
  -- dela — duas defesas, porque evento de conversão duplicado ensina errado.
  event_id text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  meta_result jsonb,
  google_result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,

  -- Momento da transição, não do envio. A CAPI carimba o evento com ele, e o
  -- disparo pode acontecer minutos depois, quando o cron rodar.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, event_id)
);

CREATE INDEX IF NOT EXISTS conv_dispatch_pendentes
  ON public.conversion_dispatches (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.conversion_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conv_dispatch_membro ON public.conversion_dispatches;
CREATE POLICY conv_dispatch_membro ON public.conversion_dispatches
  FOR SELECT USING (public.check_membership(company_id));

-- 3. O gatilho.
--
-- Fica no banco, e não na aplicação, porque as portas são várias: arrastar no
-- board roda no NAVEGADOR, etiquetar no WhatsApp roda no SERVIDOR pelo webhook,
-- e ainda há automação. Espalhar a regra por três caminhos garante que um dia
-- um deles esqueça de chamar. No banco, qualquer UPDATE que mude `stage_id`
-- passa por aqui — inclusive um feito à mão no psql.
CREATE OR REPLACE FUNCTION public.enfileirar_conversao_de_etapa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map public.stage_conversion_mappings%ROWTYPE;
BEGIN
  -- Só transição de verdade. UPDATE que não mexe na etapa não é conversão.
  IF NEW.stage_id IS NULL OR NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_map
  FROM public.stage_conversion_mappings
  WHERE company_id = NEW.company_id AND stage_id = NEW.stage_id AND is_active
  LIMIT 1;

  -- Etapa sem configuração não dispara nada. É o caso da maioria das etapas.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_map.meta_event_name IS NULL AND v_map.google_conversion_action IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversion_dispatches
    (company_id, lead_id, stage_id, event_id, occurred_at)
  VALUES
    (NEW.company_id, NEW.id, NEW.stage_id,
     -- md5 e nao sha256 do pgcrypto: `digest()` vive no schema `extensions` no
     -- Supabase e nao esta no search_path blindado desta funcao. Dependeria de
     -- qualificar o schema, que muda entre instalacoes. `md5()` e do core do
     -- Postgres, sempre existe, e aqui a funcao so precisa ser deterministica e
     -- unica — nao e contexto de seguranca.
     md5(NEW.id::text || ':' || NEW.stage_id::text),
     now())
  ON CONFLICT (company_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_conversao_de_etapa ON public.leads;
CREATE TRIGGER leads_conversao_de_etapa
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enfileirar_conversao_de_etapa();
