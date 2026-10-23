-- Gatilho de automação: "Etiqueta aplicada".
--
-- Quem etiqueta um lead (na ficha do CRM, no painel da conversa, por outra automação ou pela
-- captura) passa a poder disparar uma regra: "etiqueta é X" → enviar template, atribuir, mover
-- etapa, chamar webhook. O motor já é agnóstico ao evento (o trabalhador só lê `lead_id` e a
-- ação); faltavam o evento no vocabulário e o gatilho em `lead_tags`.
--
-- Convive com `lead_tags_move_etapa` (etiqueta do CRM → etapa): os dois disparam no mesmo INSERT
-- e são independentes. A mudança de etapa que a etiqueta causar enfileira `stage_changed` por si.

-- 1. Vocabulário: o CHECK de `trigger_event` foi criado inline (nome gerado), então procura pela
--    definição, como a migração 20261015200000 fez.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.contype = 'c'
       AND con.conrelid = 'public.automation_rules'::regclass
       AND pg_get_constraintdef(con.oid) ILIKE '%trigger_event%'
  LOOP
    EXECUTE format('ALTER TABLE public.automation_rules DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_trigger_event_check CHECK (trigger_event IN (
    'lead_created',
    'stage_changed',
    'form_abandoned',
    'whatsapp_message_received',
    'tag_added'
  ));

-- 2. O gatilho.
--
-- Dedup pelo id da linha de `lead_tags`: etiquetar de novo (depois de remover) é outro evento;
-- já o clique duplo na mesma sugestão não insere linha (o upsert só atualiza), então não repete.
-- Teto de 500 pendentes por empresa, como nas mensagens: uma importação com etiquetas não pode
-- encher a fila e atrasar as automações dos leads de verdade.
--
-- `exception when others` é obrigatório (regra do repositório): automação é acessório, e uma
-- falha aqui não pode impedir a gravação da etiqueta.
CREATE OR REPLACE FUNCTION public.disparar_automacao_de_etiqueta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_etapa text;
BEGIN
  BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    IF (SELECT count(*) FROM public.automation_jobs j
         WHERE j.company_id = v_lead.company_id AND j.status = 'pending') >= 500 THEN
      RETURN NEW;
    END IF;

    SELECT s.name INTO v_etapa FROM public.stages s WHERE s.id = v_lead.stage_id;

    PERFORM public.enfileirar_automacao(
      v_lead.company_id,
      'tag_added',
      v_lead.id,
      jsonb_build_object(
        'lead_id', v_lead.id,
        -- Minúsculas e sem espaço nas pontas: o operador `igual` do motor diferencia maiúsculas, e
        -- "Orçamento" e "orçamento" são a mesma etiqueta para quem configura (a tela guarda o valor
        -- da condição do mesmo jeito).
        'etiqueta', lower(btrim(NEW.tag_name)),
        'nome', v_lead.name,
        'email', v_lead.email,
        'telefone', v_lead.phone,
        'score', v_lead.score,
        'temperatura', v_lead.temperature,
        'origem', v_lead.source,
        'etapa', v_etapa
      ),
      'tag:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enfileirar automação de etiqueta falhou para o lead %: %', NEW.lead_id, sqlerrm;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_tags_automacao ON public.lead_tags;
CREATE TRIGGER lead_tags_automacao
  AFTER INSERT ON public.lead_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.disparar_automacao_de_etiqueta();

REVOKE ALL ON FUNCTION public.disparar_automacao_de_etiqueta() FROM PUBLIC, anon, authenticated;
