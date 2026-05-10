-- 1. Create a truly optimized check_membership that bypasses RLS for speed
CREATE OR REPLACE FUNCTION public.check_membership_internal(p_company_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships 
    WHERE user_id = p_user_id AND company_id = p_company_id
  );
$$;

-- 2. Optimized Create RPC
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
    v_user_id uuid := auth.uid();
BEGIN
    -- Security Check
    IF v_user_id IS NULL OR NOT public.check_membership_internal(p_tenant_id, v_user_id) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- 1. Insert Form
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
        COALESCE(NULLIF(p_form_data->>'slug', ''), 'form-' || substring(gen_random_uuid()::text from 1 for 8)),
        COALESCE(p_form_data->>'status', 'draft'),
        COALESCE(p_form_data->>'type', 'standard'),
        COALESCE(p_form_data->'settings', '{}'::jsonb),
        p_form_data->>'description'
    ) RETURNING id INTO v_form_id;

    -- 2. Bulk Insert Fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules
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
            label text, name text, type text, required boolean, placeholder text, 
            options jsonb, sort_order integer, step_number integer, 
            validation_rules jsonb, logic_rules jsonb, score_rules jsonb
        );
    END IF;

    RETURN v_form_id;
END;
$$;

-- 3. Optimized Update RPC
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
    -- Authorization Check
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
        settings = public.forms.settings || COALESCE(p_form_data->'settings', '{}'::jsonb),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- 2. Replace Fields
    DELETE FROM public.form_fields WHERE form_id = p_form_id;

    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules
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
