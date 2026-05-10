-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_forms_tenant_id ON public.forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON public.form_fields(form_id);

-- Drop and recreate the RPC with SECURITY DEFINER to bypass RLS internal latency issues
-- and ensure it runs within a stable transaction context.
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
    v_field jsonb;
    v_slug text;
    v_settings jsonb;
    v_current_settings jsonb;
    v_tenant_id uuid;
BEGIN
    -- 1. Check if form exists and get tenant_id
    SELECT tenant_id, settings INTO v_tenant_id, v_current_settings 
    FROM public.forms 
    WHERE id = p_form_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Form with ID % not found', p_form_id;
    END IF;

    -- 2. Authorization check: Ensure the current user has access to this form's company
    -- We do this explicitly because SECURITY DEFINER bypasses RLS
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() AND company_id = v_tenant_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized access to form';
    END IF;

    -- Handle slug: use provided (if not empty), otherwise keep existing
    v_slug := NULLIF(p_form_data->>'slug', '');
    
    -- Handle settings: merge with current settings to prevent data loss
    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    
    IF jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

    -- Merge settings (v_settings takes priority)
    v_settings := COALESCE(v_current_settings, '{}'::jsonb) || v_settings;

    -- 2. Update form metadata
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

    -- 3. Replace fields: Delete and Insert
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

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
                p_form_id,
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
END;
$$;

-- Do the same for create_form_with_fields for consistency
CREATE OR REPLACE FUNCTION public.create_form_with_fields(
    p_tenant_id uuid,
    p_form_data jsonb,
    p_fields jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_form_id uuid;
    v_field jsonb;
    v_slug text;
    v_settings jsonb;
BEGIN
    -- Authorization check
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() AND company_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized to create form for this company';
    END IF;

    -- Handle slug
    v_slug := NULLIF(p_form_data->>'slug', '');
    IF v_slug IS NULL THEN
        v_slug := 'form-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;

    -- Handle settings
    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    IF jsonb_typeof(v_settings) != 'object' THEN
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
$$;