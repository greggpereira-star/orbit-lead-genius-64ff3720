-- 1. Correct the RLS policy for form_fields to include WITH CHECK
-- This was likely causing the "Unauthorized" error or silent failure because 
-- the RPC (Security Definer) was hitting RLS limits during the DELETE/INSERT batch.
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_fields.form_id AND public.check_membership(f.company_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_fields.form_id AND public.check_membership(f.company_id)
    ));

-- 2. Audit form_steps as well just in case
DROP POLICY IF EXISTS "Users can manage form steps for their forms" ON public.form_steps;
CREATE POLICY "Users can manage form steps for their forms" ON public.form_steps
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_steps.form_id AND public.check_membership(f.company_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_steps.form_id AND public.check_membership(f.company_id)
    ));
