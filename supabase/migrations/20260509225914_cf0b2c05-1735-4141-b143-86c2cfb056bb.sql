CREATE OR REPLACE FUNCTION public.create_form_with_fields(
    p_tenant_id UUID,
    p_form_data JSONB,
    p_fields JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_form_id UUID;
    v_field RECORD;
BEGIN
    -- 1. Insert form metadata
    INSERT INTO public.forms (
        tenant_id,
        name,
        slug,
        status,
        type,
        settings,
        description
    ) VALUES (
        p_tenant_id,
        p_form_data->>'name',
        COALESCE(p_form_data->>'slug', 'form-' || substring(gen_random_uuid()::text from 1 for 8)),
        COALESCE(p_form_data->>'status', 'draft'),
        COALESCE(p_form_data->>'type', 'traditional'),
        COALESCE(p_form_data->'settings', '{"theme": "premium-light", "capture_utms": true, "submit_label": "Submit", "success_message": "Thank you!"}'::jsonb),
        p_form_data->>'description'
    )
    RETURNING id INTO v_form_id;

    -- 2. Insert fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
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
                v_form_id,
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
    END IF;

    RETURN v_form_id;
END;
$$;
