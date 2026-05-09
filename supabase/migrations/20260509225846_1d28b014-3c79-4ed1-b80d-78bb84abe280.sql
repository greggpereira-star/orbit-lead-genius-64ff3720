CREATE OR REPLACE FUNCTION public.update_form_with_fields(
    p_form_id UUID,
    p_form_data JSONB,
    p_fields JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_field RECORD;
BEGIN
    -- 1. Update form metadata
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(p_form_data->>'slug', slug),
        status = COALESCE(p_form_data->>'status', status),
        type = COALESCE(p_form_data->>'type', type),
        settings = COALESCE(p_form_data->'settings', settings),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- 2. Delete existing fields
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

    -- 3. Insert new fields
    FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
    LOOP
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
        ) VALUES (
            p_form_id,
            v_field.value->>'label',
            v_field.value->>'name',
            v_field.value->>'type',
            (v_field.value->>'required')::BOOLEAN,
            v_field.value->>'placeholder',
            COALESCE(v_field.value->'options', '[]'::jsonb),
            (v_field.value->>'sort_order')::INTEGER,
            COALESCE((v_field.value->>'step_number')::INTEGER, 1),
            COALESCE(v_field.value->'validation_rules', '{}'::jsonb),
            COALESCE(v_field.value->'logic_rules', '{}'::jsonb),
            COALESCE(v_field.value->'score_rules', '{}'::jsonb)
        );
    END LOOP;
END;
$$;
