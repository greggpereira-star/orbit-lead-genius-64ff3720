CREATE OR REPLACE FUNCTION public.update_form_with_fields(p_form_id uuid, p_form_data jsonb, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_field RECORD;
    v_slug TEXT;
BEGIN
    -- 1. Check if form exists
    IF NOT EXISTS (SELECT 1 FROM public.forms WHERE id = p_form_id) THEN
        RAISE EXCEPTION 'Form with ID % not found', p_form_id;
    END IF;

    -- Handle slug: use provided (if not empty), otherwise keep existing
    v_slug := NULLIF(p_form_data->>'slug', '');

    -- 2. Update form metadata
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(v_slug, slug),
        status = COALESCE(p_form_data->>'status', status),
        type = COALESCE(p_form_data->>'type', type),
        settings = COALESCE(p_form_data->'settings', settings),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- 3. Replace fields: Delete and Insert
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

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
                p_form_id,
                COALESCE(v_field.value->>'label', 'Field'),
                COALESCE(v_field.value->>'name', 'field_' || (v_field.value->>'sort_order')),
                COALESCE(v_field.value->>'type', 'text'),
                COALESCE((v_field.value->>'required')::BOOLEAN, false),
                v_field.value->>'placeholder',
                COALESCE(v_field.value->'options', '[]'::jsonb),
                COALESCE((v_field.value->>'sort_order')::INTEGER, 0),
                COALESCE((v_field.value->>'step_number')::INTEGER, 1),
                COALESCE(v_field.value->'validation_rules', '{}'::jsonb),
                COALESCE(v_field.value->'logic_rules', '{}'::jsonb),
                COALESCE(v_field.value->'score_rules', '{}'::jsonb)
            );
        END LOOP;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_form_with_fields(p_tenant_id uuid, p_form_data jsonb, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_form_id UUID;
    v_field RECORD;
    v_slug TEXT;
BEGIN
    -- Handle slug: use provided, or generate one if null or empty
    v_slug := NULLIF(p_form_data->>'slug', '');
    IF v_slug IS NULL THEN
        v_slug := 'form-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;

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
        COALESCE(p_form_data->>'name', 'Untitled Form'),
        v_slug,
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
                COALESCE(v_field.value->>'label', 'Field'),
                COALESCE(v_field.value->>'name', 'field_' || (v_field.value->>'sort_order')),
                COALESCE(v_field.value->>'type', 'text'),
                COALESCE((v_field.value->>'required')::BOOLEAN, false),
                v_field.value->>'placeholder',
                COALESCE(v_field.value->'options', '[]'::jsonb),
                COALESCE((v_field.value->>'sort_order')::INTEGER, 0),
                COALESCE((v_field.value->>'step_number')::INTEGER, 1),
                COALESCE(v_field.value->'validation_rules', '{}'::jsonb),
                COALESCE(v_field.value->'logic_rules', '{}'::jsonb),
                COALESCE(v_field.value->'score_rules', '{}'::jsonb)
            );
        END LOOP;
    END IF;

    RETURN v_form_id;
END;
$function$;