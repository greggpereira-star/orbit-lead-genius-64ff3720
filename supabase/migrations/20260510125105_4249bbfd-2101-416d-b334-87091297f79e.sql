-- 1. Create optimized batch insert for form fields
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
        company_id,
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
        COALESCE(p_form_data->>'type', 'standard'),
        v_settings,
        p_form_data->>'description'
    ) RETURNING id INTO v_form_id;

    -- 2. Batch insert fields
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
            v_form_id,
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

    RETURN v_form_id;
END;
$$;

-- 2. Create optimized batch update for form fields
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
    -- 1. Check if form exists and get company_id
    SELECT company_id, settings INTO v_company_id, v_current_settings 
    FROM public.forms 
    WHERE id = p_form_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Form with ID % not found', p_form_id;
    END IF;

    -- 2. Authorization check
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized access to form';
    END IF;

    -- Handle slug
    v_slug := NULLIF(p_form_data->>'slug', '');
    
    -- Handle settings
    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    IF jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

    -- Merge settings
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

    -- 3. Replace fields using batch
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

-- 3. Optimization and index management
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id_step ON public.form_fields (form_id, step_id);
CREATE INDEX IF NOT EXISTS idx_form_steps_form_id_sort ON public.form_steps (form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_forms_company_created ON public.forms (company_id, created_at DESC);

-- Rename legacy constraint if it exists to match current schema naming
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forms_tenant_id_slug_key') THEN
        ALTER TABLE public.forms RENAME CONSTRAINT forms_tenant_id_slug_key TO forms_company_id_slug_key;
    END IF;
END $$;
