-- 1. Redefine check_membership to be more explicit
CREATE OR REPLACE FUNCTION public.check_membership(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_company_id
    );
END;
$$;

-- 2. Add specific policies for form_fields and form_steps to be more performant
-- Using a direct join in the policy can be faster than calling check_membership for every row if the planner optimizes it.
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.forms f
            JOIN public.memberships m ON m.company_id = f.company_id
            WHERE f.id = form_fields.form_id AND m.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.forms f
            JOIN public.memberships m ON m.company_id = f.company_id
            WHERE f.id = form_fields.form_id AND m.user_id = auth.uid()
        )
    );

-- 3. Ensure the RPCs are using the updated logic
-- (The RPCs already call check_membership which we just updated)
