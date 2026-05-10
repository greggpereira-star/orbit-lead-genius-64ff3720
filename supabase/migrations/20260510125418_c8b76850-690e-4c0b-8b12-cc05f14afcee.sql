-- 1. Apply secure search_path to all remaining public functions
ALTER FUNCTION public.handle_lead_sync_trigger() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2. Audit and fix overly permissive RLS policies (from linter feedback)
-- Note: SELECT policies with true are often intentional, but we should be careful with other operations.
-- Replacing generic "permissive" policies with membership-based checks where appropriate.

-- Ensuring companies table has strict membership check for updates
DROP POLICY IF EXISTS "Owners can update their companies" ON public.companies;
CREATE POLICY "Owners can update their companies" ON public.companies
    FOR UPDATE USING (public.check_membership(id));

-- Ensuring memberships table has strict checks
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.memberships;
CREATE POLICY "Users can view their own memberships" ON public.memberships
    FOR SELECT USING (auth.uid() = user_id);

-- Cleanup any remaining public access to form steps/fields that doesn't respect publication status
DROP POLICY IF EXISTS "Form fields are publicly viewable if form is published" ON public.form_fields;
CREATE POLICY "Form fields are publicly viewable if form is published" ON public.form_fields
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_fields.form_id AND f.status = 'published'
    ));

DROP POLICY IF EXISTS "Users can view form steps for their forms" ON public.form_steps;
CREATE POLICY "Form steps are publicly viewable if form is published" ON public.form_steps
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_steps.form_id AND f.status = 'published'
    ));
