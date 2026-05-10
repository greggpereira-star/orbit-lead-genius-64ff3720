-- 1. Redefine update_form_with_fields with better handling for step_id and performance
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
    v_user_id uuid := auth.uid();
BEGIN
    -- Authorization Check (Optimized)
    SELECT company_id INTO v_company_id FROM public.forms WHERE id = p_form_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Form not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_user_id IS NULL OR NOT public.check_membership_internal(v_company_id, v_user_id) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- 1. Atomic Update metadata
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(NULLIF(p_form_data->>'slug', ''), slug),
        status = COALESCE(p_form_data->>'status', status),
        settings = COALESCE(p_form_data->'settings', settings),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- 2. Bulk delete fields (Fastest way)
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

    -- 3. Bulk insert fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, step_id,
            validation_rules, logic_rules, score_rules
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
            CASE 
                WHEN f.step_id IS NOT NULL AND f.step_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN f.step_id::uuid 
                ELSE NULL 
            END,
            COALESCE(f.validation_rules, '{}'::jsonb),
            COALESCE(f.logic_rules, '{}'::jsonb),
            COALESCE(f.score_rules, '{}'::jsonb)
        FROM jsonb_to_recordset(p_fields) AS f(
            label text, name text, type text, required boolean, placeholder text, 
            options jsonb, sort_order integer, step_number integer, step_id text,
            validation_rules jsonb, logic_rules jsonb, score_rules jsonb
        );
    END IF;
END;
$$;

-- 2. Ensure non-recursive RLS for form_fields (critical for large forms)
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms"
ON public.form_fields
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_fields.form_id
    AND check_membership(f.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_fields.form_id
    AND check_membership(f.company_id)
  )
);
