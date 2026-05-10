-- 1. Optimize Form Fields RLS (Remove loop-prone subqueries)
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL USING (
        form_id IN (
            SELECT f.id FROM public.forms f 
            WHERE public.check_membership(f.company_id)
        )
    )
    WITH CHECK (
        form_id IN (
            SELECT f.id FROM public.forms f 
            WHERE public.check_membership(f.company_id)
        )
    );

-- 2. Optimize Form Steps RLS
DROP POLICY IF EXISTS "Users can manage form steps for their forms" ON public.form_steps;
CREATE POLICY "Users can manage form steps for their forms" ON public.form_steps
    FOR ALL USING (
        form_id IN (
            SELECT f.id FROM public.forms f 
            WHERE public.check_membership(f.company_id)
        )
    )
    WITH CHECK (
        form_id IN (
            SELECT f.id FROM public.forms f 
            WHERE public.check_membership(f.company_id)
        )
    );

-- 3. Ensure mandatory high-performance indices
CREATE INDEX IF NOT EXISTS idx_form_fields_composite ON public.form_fields (form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_steps_composite ON public.form_steps (form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_memberships_lookup ON public.memberships (user_id, company_id);

-- 4. Audit check_membership for absolute speed
CREATE OR REPLACE FUNCTION public.check_membership(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE user_id = auth.uid() AND company_id = p_company_id
  );
$$;
