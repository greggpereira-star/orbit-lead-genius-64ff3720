-- Etiqueta do CRM → etapa do funil (e, por consequência, conversão).
--
-- Etiqueta e etapa são o MESMO estado visto de dois lugares (decisão do produto, a mesma que
-- vale para a etiqueta do WhatsApp). Aplicar a etiqueta no lead move o card; o evento de
-- conversão sai da TRANSIÇÃO de etapa pelo gatilho que já existe
-- (`leads_conversao_de_etapa`), então as portas (arrastar o card, "Mover para etapa", etiqueta
-- do WhatsApp, etiqueta do CRM) levam a um evento só: o índice (company_id, event_id) barra a
-- segunda.
--
-- O gatilho fica em `lead_tags` (e não no código) para valer em QUALQUER caminho que grave a
-- etiqueta: a tela do lead, a ação "Aplicar etiqueta" das automações, a captura por formulário.

-- 1. A etiqueta que leva à etapa, no mesmo mapeamento onde já vivem o evento e a etiqueta do
--    WhatsApp.
ALTER TABLE public.stage_conversion_mappings
  ADD COLUMN IF NOT EXISTS crm_tag text;

ALTER TABLE public.stage_conversion_mappings
  DROP CONSTRAINT IF EXISTS stage_conv_map_crm_tag_len;
ALTER TABLE public.stage_conversion_mappings
  ADD CONSTRAINT stage_conv_map_crm_tag_len
  CHECK (crm_tag IS NULL OR char_length(btrim(crm_tag)) BETWEEN 1 AND 60);

-- Uma etiqueta leva a UMA etapa por empresa (sem diferenciar maiúsculas). Duas etapas com a
-- mesma etiqueta tornariam o destino indeterminado.
CREATE UNIQUE INDEX IF NOT EXISTS stage_conv_map_crm_tag_uniq
  ON public.stage_conversion_mappings (company_id, lower(btrim(crm_tag)))
  WHERE crm_tag IS NOT NULL AND is_active;

-- 2. O gatilho.
--
-- Regras de segurança do avanço:
--  * só AVANÇA: etiqueta de etapa anterior (ou a mesma) não move o card para trás nem repete
--    evento. Voltar o lead é decisão de quem arrasta o card, não efeito de uma etiqueta.
--  * lead em etapa final (ganho/perdido) não é arrancado dela por etiqueta de etapa aberta.
--  * etiqueta sem etapa configurada é uso comum de etiqueta e não faz nada.
CREATE OR REPLACE FUNCTION public.mover_lead_pela_etiqueta_do_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead   RECORD;
  v_map    public.stage_conversion_mappings%ROWTYPE;
  v_alvo   RECORD;
  v_atual  RECORD;
  v_status text;
  v_primeira_aberta uuid;
BEGIN
  SELECT id, company_id, stage_id INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_map
  FROM public.stage_conversion_mappings
  WHERE company_id = v_lead.company_id
    AND is_active
    AND crm_tag IS NOT NULL
    AND lower(btrim(crm_tag)) = lower(btrim(NEW.tag_name))
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT id, kind, COALESCE(order_index, 0) AS ordem INTO v_alvo
  FROM public.stages
  WHERE id = v_map.stage_id AND company_id = v_lead.company_id;
  IF NOT FOUND THEN
    RETURN NEW; -- a etapa foi apagada
  END IF;

  IF v_lead.stage_id IS NOT NULL THEN
    IF v_lead.stage_id = v_alvo.id THEN
      RETURN NEW; -- já está nela
    END IF;
    SELECT kind, COALESCE(order_index, 0) AS ordem INTO v_atual
    FROM public.stages WHERE id = v_lead.stage_id;
    IF FOUND THEN
      -- Não arranca o lead de uma etapa final por causa de uma etiqueta de etapa aberta.
      IF v_atual.kind IN ('won', 'lost') AND v_alvo.kind = 'open' THEN
        RETURN NEW;
      END IF;
      -- Só avança.
      IF v_alvo.ordem <= v_atual.ordem THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Mesmo status que o board e a etiqueta do WhatsApp derivam: ganho/perdido pela etapa; a
  -- primeira etapa aberta é "new"; as demais abertas, "contacted".
  IF v_alvo.kind = 'won' THEN
    v_status := 'won';
  ELSIF v_alvo.kind = 'lost' THEN
    v_status := 'lost';
  ELSE
    SELECT id INTO v_primeira_aberta
    FROM public.stages
    WHERE company_id = v_lead.company_id AND kind = 'open'
    ORDER BY COALESCE(order_index, 0), created_at
    LIMIT 1;
    v_status := CASE WHEN v_primeira_aberta = v_alvo.id THEN 'new' ELSE 'contacted' END;
  END IF;

  -- O UPDATE de stage_id aciona `leads_conversao_de_etapa`, que enfileira a conversão.
  UPDATE public.leads
     SET stage_id = v_alvo.id,
         stage_entered_at = now(),
         status = v_status,
         updated_at = now()
   WHERE id = v_lead.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_tags_move_etapa ON public.lead_tags;
CREATE TRIGGER lead_tags_move_etapa
  AFTER INSERT ON public.lead_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.mover_lead_pela_etiqueta_do_crm();

-- Função de gatilho não é para ser chamada por ninguém.
REVOKE ALL ON FUNCTION public.mover_lead_pela_etiqueta_do_crm() FROM PUBLIC, anon, authenticated;
