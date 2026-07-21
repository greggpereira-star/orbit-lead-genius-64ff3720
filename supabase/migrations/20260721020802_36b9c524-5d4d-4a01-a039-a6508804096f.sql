
-- 1. chat_conversations: scope anon policies by x-visitor-id header
DROP POLICY IF EXISTS "anon read conversation" ON public.chat_conversations;
DROP POLICY IF EXISTS "anon update conversation" ON public.chat_conversations;
DROP POLICY IF EXISTS "anon create conversation" ON public.chat_conversations;

CREATE POLICY "anon read own conversation" ON public.chat_conversations
  FOR SELECT TO anon
  USING (visitor_id IS NOT NULL AND visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', ''));

CREATE POLICY "anon insert own conversation" ON public.chat_conversations
  FOR INSERT TO anon
  WITH CHECK (visitor_id IS NOT NULL AND visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', ''));

CREATE POLICY "anon update own conversation" ON public.chat_conversations
  FOR UPDATE TO anon
  USING (visitor_id IS NOT NULL AND visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', ''))
  WITH CHECK (visitor_id IS NOT NULL AND visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', ''));

-- 2. chat_messages: scope anon by header via conversation ownership
DROP POLICY IF EXISTS "anon read messages" ON public.chat_messages;
DROP POLICY IF EXISTS "anon insert visitor message" ON public.chat_messages;

CREATE POLICY "anon read own messages" ON public.chat_messages
  FOR SELECT TO anon
  USING (
    conversation_id IN (
      SELECT id FROM public.chat_conversations
      WHERE visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', '')
    )
  );

CREATE POLICY "anon insert own visitor message" ON public.chat_messages
  FOR INSERT TO anon
  WITH CHECK (
    sender_type = 'visitor'
    AND conversation_id IN (
      SELECT id FROM public.chat_conversations
      WHERE visitor_id = nullif(current_setting('request.headers', true)::json->>'x-visitor-id', '')
    )
  );

-- 3. form_partial_submissions: replace public-ALL with scoped policies
DROP POLICY IF EXISTS "Public partial submissions" ON public.form_partial_submissions;

CREATE POLICY "Members manage partial submissions" ON public.form_partial_submissions
  FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

CREATE POLICY "Anon insert own partial submission" ON public.form_partial_submissions
  FOR INSERT TO anon
  WITH CHECK (session_id IS NOT NULL AND session_id = nullif(current_setting('request.headers', true)::json->>'x-session-id', ''));

CREATE POLICY "Anon read own partial submission" ON public.form_partial_submissions
  FOR SELECT TO anon
  USING (session_id IS NOT NULL AND session_id = nullif(current_setting('request.headers', true)::json->>'x-session-id', ''));

CREATE POLICY "Anon update own partial submission" ON public.form_partial_submissions
  FOR UPDATE TO anon
  USING (session_id IS NOT NULL AND session_id = nullif(current_setting('request.headers', true)::json->>'x-session-id', ''))
  WITH CHECK (session_id IS NOT NULL AND session_id = nullif(current_setting('request.headers', true)::json->>'x-session-id', ''));

-- 4. export_audit_logs: align to company membership on tenant_id
DROP POLICY IF EXISTS "Tenants can view their own export logs" ON public.export_audit_logs;
CREATE POLICY "Members view export logs" ON public.export_audit_logs
  FOR SELECT TO authenticated
  USING (public.check_membership(tenant_id));

-- 5. form_events: align to company membership on tenant_id
DROP POLICY IF EXISTS "Tenants can view their own form events" ON public.form_events;
CREATE POLICY "Members view form events" ON public.form_events
  FOR SELECT TO authenticated
  USING (public.check_membership(tenant_id));

-- 6. SECURITY DEFINER function EXECUTE cleanup — revoke public/anon on privileged ones
REVOKE EXECUTE ON FUNCTION public.check_membership(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_membership_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_membership_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_form_with_fields(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_company(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_context_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pick_next_routing_member(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_form_builder_v1(uuid, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_form_core_v1(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_form_fields_delta_v1(uuid, uuid, jsonb, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_form_options_batch_v1(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_form_options_delta_v1(uuid, uuid, uuid, jsonb, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_form_v2(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_form_with_fields(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_lead_sync_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_create_lead_from_conversation() FROM PUBLIC, anon, authenticated;

-- 7. Drop unused stub with mutable search_path
DROP FUNCTION IF EXISTS public.check_membership_test(uuid);
