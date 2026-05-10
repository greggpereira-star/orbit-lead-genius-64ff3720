-- 1. Create a security-optimized membership helper function
CREATE OR REPLACE FUNCTION public.check_membership(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() AND company_id = p_company_id
    );
END;
$$;

-- 2. Update RPC functions with secure search_path and optimized logic
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
    -- Use helper for consistent security
    IF NOT public.check_membership(p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to create form for this company';
    END IF;

    v_slug := NULLIF(p_form_data->>'slug', '');
    IF v_slug IS NULL THEN
        v_slug := 'form-' || substring(gen_random_uuid()::text from 1 for 8);
    END IF;

    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    IF jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

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
    SELECT company_id, settings INTO v_company_id, v_current_settings 
    FROM public.forms 
    WHERE id = p_form_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Form with ID % not found', p_form_id;
    END IF;

    IF NOT public.check_membership(v_company_id) THEN
        RAISE EXCEPTION 'Unauthorized access to form';
    END IF;

    v_slug := NULLIF(p_form_data->>'slug', '');
    v_settings := COALESCE(p_form_data->'settings', '{}'::jsonb);
    
    IF jsonb_typeof(v_settings) != 'object' THEN
        v_settings := '{}'::jsonb;
    END IF;

    v_settings := COALESCE(v_current_settings, '{}'::jsonb) || v_settings;

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

-- 3. Secure and fast RLS Policies
-- Forms
DROP POLICY IF EXISTS "Users can manage forms of their company" ON public.forms;
CREATE POLICY "Users can manage forms of their company" ON public.forms
    FOR ALL USING (public.check_membership(company_id))
    WITH CHECK (public.check_membership(company_id));

-- Form Fields (Inherit security from form)
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms" ON public.form_fields
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_fields.form_id AND public.check_membership(f.company_id)
    ));

-- Form Steps (Inherit security from form)
DROP POLICY IF EXISTS "Users can view form steps for their forms" ON public.form_steps;
DROP POLICY IF EXISTS "Users can insert form steps for their forms" ON public.form_steps;
DROP POLICY IF EXISTS "Users can update form steps for their forms" ON public.form_steps;
DROP POLICY IF EXISTS "Users can delete form steps for their forms" ON public.form_steps;

CREATE POLICY "Users can manage form steps for their forms" ON public.form_steps
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.forms f 
        WHERE f.id = form_steps.form_id AND public.check_membership(f.company_id)
    ));
