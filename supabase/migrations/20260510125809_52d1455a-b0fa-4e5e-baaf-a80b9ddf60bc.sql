-- 1. Final optimization of update_form_with_fields
-- Ensuring the Security Definer context handles the batch delete/insert perfectly
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
    v_slug text;
    v_settings jsonb;
    v_current_settings jsonb;
    v_company_id uuid;
BEGIN
    -- Atomic Check
    SELECT company_id, settings INTO v_company_id, v_current_settings 
    FROM public.forms 
    WHERE id = p_form_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Form with ID % not found', p_form_id;
    END IF;

    -- Authorization check using the more resilient check_membership
    IF NOT public.check_membership(v_company_id) THEN
        RAISE EXCEPTION 'Unauthorized access to form';
    END IF;

    v_slug := NULLIF(p_form_data->>'slug', '');
    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    
    IF jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

    -- Merge settings
    v_settings := COALESCE(v_current_settings, '{}'::jsonb) || v_settings;

    -- Update main form
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(v_slug, slug),
        status = COALESCE(p_form_data->>'status', status),
        type = COALESCE(p_form_data->>'type', type),
        settings = v_settings,
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- REPLACE fields in one transaction
    -- We delete first, then batch insert
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
            label text, 
            name text, 
            type text, 
            required boolean, 
            placeholder text, 
            options jsonb, 
            sort_order integer, 
            step_number integer, 
            validation_rules jsonb, 
            logic_rules jsonb, 
            score_rules jsonb
        );
    END IF;
END;
$$;
