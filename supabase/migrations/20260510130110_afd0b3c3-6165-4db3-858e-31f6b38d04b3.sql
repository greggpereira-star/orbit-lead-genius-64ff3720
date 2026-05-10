-- 1. Optimize check_membership to be as fast as humanly possible
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

-- 2. Simplify Forms RLS (Direct check)
DROP POLICY IF EXISTS "Users can manage forms of their company" ON public.forms;
CREATE POLICY "Users can manage forms of their company" ON public.forms
    FOR ALL USING (public.check_membership(company_id));

-- 3. CRITICAL: Simplify Form Fields RLS to avoid subquery loops
-- This is where most timeouts happen. We use a more direct join-like approach.
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.forms f 
            WHERE f.id = form_fields.form_id 
            AND f.company_id IN (
                SELECT m.company_id FROM public.memberships m WHERE m.user_id = auth.uid()
            )
        )
    );

-- 4. CRITICAL: Simplify Form Steps RLS
DROP POLICY IF EXISTS "Users can manage form steps for their forms" ON public.form_steps;
CREATE POLICY "Users can manage form steps for their forms" ON public.form_steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.forms f 
            WHERE f.id = form_steps.form_id 
            AND f.company_id IN (
                SELECT m.company_id FROM public.memberships m WHERE m.user_id = auth.uid()
            )
        )
    );

-- 5. Revise update_form_with_fields to be even more robust
CREATE OR REPLACE FUNCTION public.update_form_with_fields(
    p_form_id uuid,
    p_form_data jsonb,
    p_fields jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
BEGIN
    -- Authorization Check
    SELECT company_id INTO v_company_id FROM public.forms WHERE id = p_form_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Form not found';
    END IF;

    IF NOT public.check_membership(v_company_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update Form Metadata
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(NULLIF(p_form_data->>'slug', ''), slug),
        status = COALESCE(p_form_data->>'status', status),
        settings = public.forms.settings || COALESCE(p_form_data->'settings', '{}'::jsonb),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- Replace Fields Atomicly
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id,
            label,
            name,
            type,
            required,
            placeholder,
            options,
            sort_order,
            step_number,
            validation_rules,
            logic_rules,
            score_rules
        )
        SELECT 
            p_form_id,
            COALESCE(f.label, 'Field'),
            COALESCE(f.name, 'field_' || (row_number() OVER ())),
            COALESCE(f.type, 'text'),
            COALESCE(f.required, false),
            f.placeholder,
            COALESCE(f.options, '[]'::jsonb),
            COALESCE(f.sort_order, 0),
            COALESCE(f.step_number, 1),
            COALESCE(f.validation_rules, '{}'::jsonb),
            COALESCE(f.logic_rules, '{}'::jsonb),
            COALESCE(f.score_rules, '{}'::jsonb)
        FROM jsonb_to_recordset(p_fields) AS f(
            label text, name text, type text, required boolean, placeholder text, 
            options jsonb, sort_order integer, step_number integer, 
            validation_rules jsonb, logic_rules jsonb, score_rules jsonb
        );
    END IF;
END;
$$;
