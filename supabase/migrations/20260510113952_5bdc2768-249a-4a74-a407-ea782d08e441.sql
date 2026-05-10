-- 1. Hardening FORMS (Non-recursive optimized)
DROP POLICY IF EXISTS "Users can manage forms of their company" ON public.forms;
CREATE POLICY "Users can manage forms of their company" ON public.forms
    FOR ALL 
    USING (tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
    WITH CHECK (tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 2. Hardening FORM_FIELDS (Linked via parent form)
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL 
    USING (form_id IN (SELECT id FROM public.forms WHERE tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())))
    WITH CHECK (form_id IN (SELECT id FROM public.forms WHERE tenant_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())));

-- 3. Hardening LEADS (Public capture + Tenant protection)
DROP POLICY IF EXISTS "Users can create company leads" ON public.leads;
DROP POLICY IF EXISTS "Public can create leads" ON public.leads; -- Clean up potential duplicates

CREATE POLICY "Users can manage their company leads" ON public.leads
    FOR ALL
    USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Public lead capture" ON public.leads
    FOR INSERT
    WITH CHECK (true); -- Public forms need to insert without auth, but tenant_id is enforced by the app

-- 4. Hardening TELEMETRY (System & Error Logs)
DROP POLICY IF EXISTS "System logs access" ON public.system_logs;
DROP POLICY IF EXISTS "System logs insertion" ON public.system_logs;

CREATE POLICY "Users can view company logs" ON public.system_logs
    FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "System can insert logs" ON public.system_logs
    FOR INSERT
    WITH CHECK (true); -- Allow background logging, filtering happens on SELECT

DROP POLICY IF EXISTS "Users can view their own company error logs" ON public.error_logs;
CREATE POLICY "Users can view company error logs" ON public.error_logs
    FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "System can insert error logs" ON public.error_logs
    FOR INSERT
    WITH CHECK (true);

-- 5. Hardening LEAD_EVENTS
DROP POLICY IF EXISTS "Users can view events of their company leads" ON public.lead_events;
CREATE POLICY "Users can manage company lead events" ON public.lead_events
    FOR ALL
    USING (lead_id IN (SELECT id FROM public.leads WHERE company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())))
    WITH CHECK (lead_id IN (SELECT id FROM public.leads WHERE company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid())));
