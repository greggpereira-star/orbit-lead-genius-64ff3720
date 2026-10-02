-- O gatilho precisa enfileirar também quando só a etiqueta está configurada.
--
-- A versão anterior só enfileirava se houvesse `meta_event_name` ou
-- `google_conversion_action`. Mas espelhar a etapa como etiqueta no WhatsApp é
-- útil sozinho — o time comercial vê no aparelho em que pé está o lead, mesmo
-- sem nenhum evento de mídia configurado. Sem esta correção, quem configurasse
-- apenas a etiqueta não veria nada acontecer e não teria como descobrir por quê.

CREATE OR REPLACE FUNCTION public.enfileirar_conversao_de_etapa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map public.stage_conversion_mappings%ROWTYPE;
BEGIN
  IF NEW.stage_id IS NULL OR NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_map
  FROM public.stage_conversion_mappings
  WHERE company_id = NEW.company_id AND stage_id = NEW.stage_id AND is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Qualquer um dos três basta: evento na Meta, conversão no Google, ou só a
  -- etiqueta espelhada.
  IF v_map.meta_event_name IS NULL
     AND v_map.google_conversion_action IS NULL
     AND v_map.whatsapp_label IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversion_dispatches
    (company_id, lead_id, stage_id, event_id, occurred_at)
  VALUES
    (NEW.company_id, NEW.id, NEW.stage_id,
     md5(NEW.id::text || ':' || NEW.stage_id::text),
     now())
  ON CONFLICT (company_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Registro do que aconteceu com a etiqueta, separado do resultado da Meta: são
-- dois destinos independentes, e um pode falhar sem o outro.
ALTER TABLE public.conversion_dispatches
  ADD COLUMN IF NOT EXISTS label_result jsonb;
