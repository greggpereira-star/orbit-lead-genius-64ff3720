-- Visibilidade das conversas do WhatsApp: "atendente vê só as dele".
--
-- Por empresa, `wa_visibilidade.modo` é:
--   'todas'     (padrão) todo membro vê todas as conversas — o comportamento de hoje;
--   'so_minhas' dono/administrador veem tudo; os demais veem só as conversas
--               atribuídas a eles, as que eles seguem, as de notas em que foram
--               mencionados e — se `ver_fila` — as sem responsável.
--
-- Sem linha na tabela = 'todas'. Aplicar esta migration não muda nada até alguém
-- ligar o modo restrito.
--
-- A restrição vale no banco (lista e tempo real passam por RLS) e, em paralelo,
-- nas server functions, que usam a chave de serviço e ignoram RLS.
-- Não cobre o CRM: nome e telefone do lead seguem visíveis a todo membro.

CREATE TABLE IF NOT EXISTS public.wa_visibilidade (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  modo text NOT NULL DEFAULT 'todas' CHECK (modo IN ('todas', 'so_minhas')),
  ver_fila boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.wa_visibilidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_visibilidade_leitura ON public.wa_visibilidade;
CREATE POLICY wa_visibilidade_leitura ON public.wa_visibilidade
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
REVOKE ALL ON public.wa_visibilidade FROM authenticated, anon;
GRANT SELECT ON public.wa_visibilidade TO authenticated;
GRANT ALL ON public.wa_visibilidade TO service_role;

-- A empresa está no modo restrito E quem pergunta não é dono/administrador?
-- Caminho rápido: sem linha de configuração ou modo 'todas' devolve false.
CREATE OR REPLACE FUNCTION public.visibilidade_restrita(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wa_visibilidade v
     WHERE v.company_id = p_company_id AND v.modo = 'so_minhas'
  ) AND NOT public.eh_admin_da_empresa(p_company_id);
$$;
REVOKE ALL ON FUNCTION public.visibilidade_restrita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visibilidade_restrita(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pode_ver_conversa(
  p_company_id uuid, p_conversation_id uuid, p_assigned_to uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.check_membership(p_company_id)
     AND (
       NOT public.visibilidade_restrita(p_company_id)
       OR p_assigned_to = auth.uid()
       OR (p_assigned_to IS NULL AND COALESCE(
             (SELECT v.ver_fila FROM public.wa_visibilidade v WHERE v.company_id = p_company_id), true))
       OR EXISTS (SELECT 1 FROM public.wa_conversation_followers f
                   WHERE f.conversation_id = p_conversation_id AND f.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.wa_mentions m
                   WHERE m.conversation_id = p_conversation_id AND m.mentioned_user_id = auth.uid())
     );
$$;
REVOKE ALL ON FUNCTION public.pode_ver_conversa(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_conversa(uuid, uuid, uuid) TO authenticated, service_role;

-- Conversa.
DROP POLICY IF EXISTS wa_conversations_leitura ON public.wa_conversations;
CREATE POLICY wa_conversations_leitura ON public.wa_conversations
  FOR SELECT TO authenticated
  USING (public.pode_ver_conversa(company_id, id, assigned_to));

-- Dependentes da conversa: herdam a visibilidade dela. O EXISTS roda sob o RLS
-- de quem consulta, então só enxerga a linha quem enxerga a conversa.
DROP POLICY IF EXISTS wa_messages_leitura ON public.wa_messages;
CREATE POLICY wa_messages_leitura ON public.wa_messages
  FOR SELECT TO authenticated
  USING (
    public.check_membership(company_id)
    AND (NOT public.visibilidade_restrita(company_id)
         OR EXISTS (SELECT 1 FROM public.wa_conversations c WHERE c.id = wa_messages.conversation_id))
  );

DROP POLICY IF EXISTS wa_message_status_events_leitura ON public.wa_message_status_events;
CREATE POLICY wa_message_status_events_leitura ON public.wa_message_status_events
  FOR SELECT TO authenticated
  USING (
    public.check_membership(company_id)
    AND (NOT public.visibilidade_restrita(company_id)
         OR EXISTS (SELECT 1 FROM public.wa_messages m WHERE m.id = wa_message_status_events.message_id))
  );

DROP POLICY IF EXISTS wa_notes_leitura ON public.wa_notes;
CREATE POLICY wa_notes_leitura ON public.wa_notes
  FOR SELECT TO authenticated
  USING (
    public.check_membership(company_id)
    AND (NOT public.visibilidade_restrita(company_id)
         OR EXISTS (SELECT 1 FROM public.wa_conversations c WHERE c.id = wa_notes.conversation_id))
  );

DROP POLICY IF EXISTS wa_scheduled_leitura ON public.wa_scheduled_messages;
CREATE POLICY wa_scheduled_leitura ON public.wa_scheduled_messages
  FOR SELECT TO authenticated
  USING (
    public.check_membership(company_id)
    AND (NOT public.visibilidade_restrita(company_id)
         OR EXISTS (SELECT 1 FROM public.wa_conversations c WHERE c.id = wa_scheduled_messages.conversation_id))
  );
