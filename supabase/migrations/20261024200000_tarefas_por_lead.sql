-- Tarefas por lead, sobre `lead_notes`.
--
-- Já existia o essencial: anotação COM `scheduled_for` é compromisso/tarefa, e `done` marca como
-- feita ("Próximas ações" do CRM grava assim, de propósito, sem um segundo sistema de tarefas). O
-- que faltava para virar ferramenta de equipe:
--   * RESPONSÁVEL (`assigned_to`): hoje a tarefa é só de quem a escreveu;
--   * quem concluiu e quando (`done_by`, `done_at`);
--   * AVISO no sino quando a tarefa é atribuída a outra pessoa e quando VENCE;
--   * o responsável poder concluir (a política de UPDATE só deixa o AUTOR editar), por função;
--   * a ação de automação `criar_tarefa`.
-- Anotação sem data continua sendo só anotação.

-- 1. Colunas ---------------------------------------------------------------------------------------
ALTER TABLE public.lead_notes
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- "Minhas tarefas": o que está em aberto para uma pessoa, por prazo.
CREATE INDEX IF NOT EXISTS lead_notes_responsavel_idx
  ON public.lead_notes (assigned_to, scheduled_for)
  WHERE scheduled_for IS NOT NULL AND done = false;

-- Owner/admin gerenciam as tarefas da empresa (as criadas por automação não têm autor, e sem isto
-- ninguém conseguiria editar ou apagar).
DROP POLICY IF EXISTS "Admins gerenciam tarefas da empresa" ON public.lead_notes;
CREATE POLICY "Admins gerenciam tarefas da empresa" ON public.lead_notes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.company_id = lead_notes.company_id
                    AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m
                       WHERE m.company_id = lead_notes.company_id
                         AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));

-- 2. Concluir: autor, responsável ou admin -------------------------------------------------------------
-- Função, e não política nova, porque a política de UPDATE do responsável deixaria ele editar o TEXTO
-- da anotação alheia. Aqui só `done`, `done_at`, `done_by` mudam.
CREATE OR REPLACE FUNCTION public.concluir_tarefa(p_id uuid, p_done boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nota public.lead_notes%ROWTYPE;
BEGIN
  SELECT * INTO v_nota FROM public.lead_notes WHERE id = p_id;
  IF NOT FOUND OR v_nota.scheduled_for IS NULL THEN
    RETURN false;
  END IF;

  -- Precisa ser da empresa E (autor, responsável ou admin).
  IF NOT EXISTS (
       SELECT 1 FROM public.memberships m
        WHERE m.company_id = v_nota.company_id AND m.user_id = auth.uid()
          AND (m.role IN ('owner', 'admin') OR m.user_id IN (v_nota.author_id, v_nota.assigned_to))
     ) THEN
    RETURN false;
  END IF;

  UPDATE public.lead_notes
     SET done = p_done,
         done_at = CASE WHEN p_done THEN now() END,
         done_by = CASE WHEN p_done THEN auth.uid() END,
         updated_at = now()
   WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.concluir_tarefa(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_tarefa(uuid, boolean) TO authenticated, service_role;

-- 3. Aviso: tarefa atribuída a outra pessoa -------------------------------------------------------------
-- Quem cria uma tarefa para si não precisa de aviso. O aviso chega para o responsável quando ele é
-- OUTRA pessoa que o autor (ou quando não há autor: tarefa criada por automação).
CREATE OR REPLACE FUNCTION public.avisar_tarefa_atribuida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_nome text;
BEGIN
  BEGIN
    IF NEW.scheduled_for IS NULL OR NEW.assigned_to IS NULL OR NEW.done THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
      RETURN NEW;
    END IF;
    IF NEW.assigned_to IS NOT DISTINCT FROM NEW.author_id THEN
      RETURN NEW;
    END IF;

    SELECT l.name INTO v_lead_nome FROM public.leads l WHERE l.id = NEW.lead_id;
    INSERT INTO public.team_notifications (company_id, user_id, lead_id, title, body, dedup_key)
    VALUES (
      NEW.company_id, NEW.assigned_to, NEW.lead_id,
      'Tarefa atribuída a você: ' || left(NEW.body, 80),
      coalesce(v_lead_nome, 'Lead') || ' · prazo '
        || to_char(NEW.scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      'tarefa-atribuida:' || NEW.id::text || ':' || NEW.assigned_to::text
    )
    ON CONFLICT (user_id, dedup_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'avisar_tarefa_atribuida falhou (%): %', NEW.id, sqlerrm;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_notes_avisa_atribuicao ON public.lead_notes;
CREATE TRIGGER lead_notes_avisa_atribuicao
  AFTER INSERT OR UPDATE OF assigned_to ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.avisar_tarefa_atribuida();
REVOKE ALL ON FUNCTION public.avisar_tarefa_atribuida() FROM PUBLIC, anon, authenticated;

-- 4. Aviso: tarefa vencida ------------------------------------------------------------------------------------
-- Para o responsável (ou, sem responsável, para o autor). Só as que venceram nas últimas 12 horas:
-- as dezenas de anotações agendadas que já estavam atrasadas quando isto foi ligado não podem virar
-- uma enxurrada de avisos. Um aviso por tarefa (chave de dedup).
CREATE OR REPLACE FUNCTION public.avisar_tarefas_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  WITH novas AS (
    INSERT INTO public.team_notifications (company_id, user_id, lead_id, title, body, dedup_key)
    SELECT n.company_id, coalesce(n.assigned_to, n.author_id), n.lead_id,
           'Tarefa vencida: ' || left(n.body, 80),
           coalesce(l.name, 'Lead') || ' · prazo era '
             || to_char(n.scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'tarefa-venceu:' || n.id::text
      FROM public.lead_notes n
      LEFT JOIN public.leads l ON l.id = n.lead_id
     WHERE n.scheduled_for IS NOT NULL
       AND n.done = false
       AND n.scheduled_for <= now()
       AND n.scheduled_for > now() - interval '12 hours'
       AND coalesce(n.assigned_to, n.author_id) IS NOT NULL
    ON CONFLICT (user_id, dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM novas;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'avisar_tarefas_vencidas falhou: %', sqlerrm;
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.avisar_tarefas_vencidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisar_tarefas_vencidas() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('avisos-de-tarefas')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisos-de-tarefas');
    PERFORM cron.schedule('avisos-de-tarefas', '* * * * *', 'SELECT public.avisar_tarefas_vencidas();');
  END IF;
END $$;

-- 5. Ação de automação "criar_tarefa" (pelo nome do CHECK) --------------------------------------------------
ALTER TABLE public.automation_actions DROP CONSTRAINT IF EXISTS automation_actions_action_type_check;
ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (action_type IN (
    'etiquetar',
    'mover_etapa',
    'atribuir_responsavel',
    'enviar_whatsapp',
    'webhook',
    'enviar_template',
    'atribuir_conversa',
    'notificar_equipe',
    'resolver_conversa',
    'reabrir_conversa',
    'avaliar_atendimento',
    'criar_tarefa'
  ));
