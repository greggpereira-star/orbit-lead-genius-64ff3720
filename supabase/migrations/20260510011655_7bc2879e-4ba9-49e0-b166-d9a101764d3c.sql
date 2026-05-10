CREATE OR REPLACE FUNCTION public.create_form_with_fields(
    p_tenant_id uuid,
    p_form_data jsonb,
    p_fields jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_form_id uuid;
    v_field jsonb;
    v_slug text;
    v_settings jsonb;
BEGIN
    -- Handle slug
    v_slug := NULLIF(p_form_data->>'slug', '');
    IF v_slug IS NULL THEN
        v_slug := 'form-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;

    -- Handle settings
    v_settings := p_form_data->'settings';
    IF v_settings IS NULL OR jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

    -- 1. Create form
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
        COALESCE(p_form_data->>'name', 'Untitled Form'),
        v_slug,
        COALESCE(p_form_data->>'status', 'draft'),
        COALESCE(p_form_data->>'type', 'traditional'),
        v_settings,
        p_form_data->>'description'
    ) RETURNING id INTO v_form_id;

    -- 2. Insert fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        FOR v_field IN SELECT jsonb_array_elements(p_fields)
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
                COALESCE(v_field->>'label', 'Field'),
                COALESCE(v_field->>'name', 'field_' || (v_field->>'sort_order')),
                COALESCE(v_field->>'type', 'text'),
                COALESCE((v_field->>'required')::boolean, false),
                v_field->>'placeholder',
                COALESCE(v_field->'options', '[]'::jsonb),
                COALESCE((v_field->>'sort_order')::integer, 0),
                COALESCE((v_field->>'step_number')::integer, 1),
                COALESCE(v_field->'validation_rules', '{}'::jsonb),
                COALESCE(v_field->'logic_rules', '{}'::jsonb),
                COALESCE(v_field->'score_rules', '{}'::jsonb)
            );
        END LOOP;
    END IF;

    RETURN v_form_id;
END;
$function$;