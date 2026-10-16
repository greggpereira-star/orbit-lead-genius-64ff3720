-- ===========================================================================
-- WhatsApp: mensagens agendadas por conversa
-- ===========================================================================
-- O atendente deixa uma mensagem para sair numa hora combinada. A decisão de
-- enviar é tomada NA HORA do envio, pela mesma política de qualquer mensagem
-- livre (opt-out, janela de 24h): agendar não é um jeito de contorná-la.
--
-- Escrita só pelo servidor. A equipe da empresa lê (precisa ver o que está
-- programado numa conversa que pode atender).

CREATE TABLE IF NOT EXISTS public.wa_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4096),
  send_at timestamptz NOT NULL,
  created_by uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'canceled')),
  attempts integer NOT NULL DEFAULT 0,
  result text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_scheduled_due_idx
  ON public.wa_scheduled_messages (send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS wa_scheduled_conversa_idx
  ON public.wa_scheduled_messages (conversation_id, send_at);

ALTER TABLE public.wa_scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_scheduled_leitura ON public.wa_scheduled_messages;
CREATE POLICY wa_scheduled_leitura ON public.wa_scheduled_messages
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

REVOKE ALL ON public.wa_scheduled_messages FROM authenticated, anon;
GRANT SELECT ON public.wa_scheduled_messages TO authenticated;
GRANT ALL ON public.wa_scheduled_messages TO service_role;

-- Reserva atômica (mesmo desenho de `reservar_jobs_de_automacao`): dois
-- disparos simultâneos do cron nunca pegam a mesma mensagem.
CREATE OR REPLACE FUNCTION public.reservar_mensagens_agendadas(p_limite integer DEFAULT 25)
RETURNS SETOF public.wa_scheduled_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.wa_scheduled_messages m
     SET status = 'sending',
         attempts = m.attempts + 1,
         started_at = now()
   WHERE m.id IN (
     SELECT id FROM public.wa_scheduled_messages
      WHERE status = 'pending' AND send_at <= now() AND attempts < 3
      ORDER BY send_at
      LIMIT greatest(1, least(p_limite, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING m.*;
$$;

-- Quem caiu no meio do envio volta à fila (ou falha, se já esgotou).
CREATE OR REPLACE FUNCTION public.liberar_mensagens_agendadas_presas(p_minutos integer DEFAULT 10)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH liberadas AS (
    UPDATE public.wa_scheduled_messages
       SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
           result = coalesce(result, 'interrompida durante o envio'),
           finished_at = CASE WHEN attempts >= 3 THEN now() ELSE finished_at END
     WHERE status = 'sending'
       AND started_at < now() - make_interval(mins => greatest(p_minutos, 2))
    RETURNING 1
  )
  SELECT count(*)::integer FROM liberadas;
$$;

REVOKE ALL ON FUNCTION public.reservar_mensagens_agendadas(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liberar_mensagens_agendadas_presas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_mensagens_agendadas(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.liberar_mensagens_agendadas_presas(integer) TO service_role;
