-- Gatilhos de automação "Conversa resolvida" e "Conversa atribuída".
--
-- Nascem de um UPDATE em `wa_conversations`, qualquer que seja o caminho (botão Resolver, menu,
-- ação "Atribuir conversa" de outra regra, rodízio). O motor já executa qualquer evento; faltavam
-- o vocabulário e os gatilhos.
--
--   conversation_resolved  status passa a 'resolved' (de qualquer outro). Reabrir e resolver de
--                          novo é OUTRO evento (a chave de dedup traz o instante).
--   conversation_assigned  assigned_to passa a apontar para alguém (de ninguém ou de outra pessoa).
--                          Desatribuir (NULL) não dispara. `responsavel_id` do payload é QUEM
--                          RECEBEU, então a ação "Notificar equipe → quem está com a conversa"
--                          avisa exatamente essa pessoa.
--
-- Contra laço (regra A atribui a B, regra B atribui a A...): no máximo 5 OCORRÊNCIAS do evento por
-- conversa em 10 minutos (conta ocorrências, não jobs: várias regras para o mesmo evento não
-- gastam o teto umas das outras). Passou disso, o evento é descartado em silêncio, como nas
-- mensagens recebidas.

-- 1. Vocabulário --------------------------------------------------------------------------------
-- Pelo NOME: a busca por definição (usada nas migrations anteriores) derrubaria também o CHECK dos
-- minutos, que cita `trigger_event`.
ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_trigger_event_check;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_trigger_event_check CHECK (trigger_event IN (
    'lead_created',
    'stage_changed',
    'form_abandoned',
    'whatsapp_message_received',
    'tag_added',
    'customer_no_reply',
    'window_expiring',
    'conversation_resolved',
    'conversation_assigned'
  ));

-- 2. O gatilho ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_automacao_de_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_evento text;
  v_contato public.wa_contacts%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_lead_id uuid;
  v_etapa text;
  v_payload jsonb;
  v_instante text := (extract(epoch FROM clock_timestamp()) * 1000000)::bigint::text;
BEGIN
  BEGIN
    IF NEW.status = 'resolved'
       AND (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'resolved') THEN
      v_evento := 'conversation_resolved';
    ELSIF NEW.assigned_to IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      v_evento := 'conversation_assigned';
    ELSE
      RETURN NEW;
    END IF;

    -- Teto contra laço e contra rajada, por conversa e evento. A chave que `enfileirar_automacao` monta é
    -- `regra:lead:conversa:instante`, então o quarto pedaço identifica a ocorrência.
    IF (SELECT count(DISTINCT split_part(j.dedup_key, ':', 4)) FROM public.automation_jobs j
         WHERE j.company_id = NEW.company_id
           AND j.trigger_event = v_evento
           AND j.created_at > now() - interval '10 minutes'
           AND j.payload ->> 'conversation_id' = NEW.id::text) >= 5 THEN
      RETURN NEW;
    END IF;
    IF (SELECT count(*) FROM public.automation_jobs j
         WHERE j.company_id = NEW.company_id AND j.status = 'pending') >= 500 THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_contato FROM public.wa_contacts WHERE id = NEW.contact_id;
    v_lead_id := coalesce(NEW.lead_id, v_contato.lead_id);
    IF v_lead_id IS NOT NULL THEN
      SELECT * INTO v_lead FROM public.leads WHERE id = v_lead_id;
      SELECT s.name INTO v_etapa FROM public.stages s WHERE s.id = v_lead.stage_id;
    END IF;

    v_payload := jsonb_build_object(
      'lead_id', v_lead_id,
      'conversation_id', NEW.id,
      'wa_id', v_contato.wa_id,
      'telefone', v_contato.wa_id,
      'nome', coalesce(nullif(btrim(v_lead.name), ''), v_contato.profile_name),
      'email', v_lead.email,
      'score', v_lead.score,
      'temperatura', v_lead.temperature,
      'origem', v_lead.source,
      'etapa', v_etapa,
      'responsavel_id', NEW.assigned_to,
      'veio_de_anuncio', CASE WHEN NEW.origin IS NULL THEN 'false' ELSE 'true' END
    );
    IF v_evento = 'conversation_assigned' THEN
      v_payload := v_payload || jsonb_build_object(
        'responsavel_anterior_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END
      );
    END IF;

    PERFORM public.enfileirar_automacao(
      NEW.company_id, v_evento, v_lead_id, v_payload,
      -- A conversa entra na chave (lead pode ser NULL) e o instante torna cada ocorrência única:
      -- resolver, reabrir e resolver de novo são três eventos legítimos.
      NEW.id::text || ':' || v_instante
    );
  EXCEPTION WHEN OTHERS THEN
    -- Acessório: nunca pode impedir a gravação da conversa.
    RAISE WARNING 'enfileirar automação de conversa falhou (%): %', NEW.id, sqlerrm;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_conversations_automacao ON public.wa_conversations;
CREATE TRIGGER wa_conversations_automacao
  AFTER INSERT OR UPDATE OF status, assigned_to ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.disparar_automacao_de_conversa();

REVOKE ALL ON FUNCTION public.disparar_automacao_de_conversa() FROM PUBLIC, anon, authenticated;
