-- Otimização da save_form_core_v1 com SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.save_form_core_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_status TEXT,
    p_settings JSONB,
    p_type TEXT DEFAULT 'standard'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    -- Validação de Permissão Manual (Necessário para SECURITY DEFINER)
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado ou usuário não autenticado';
    END IF;

    IF p_form_id IS NULL THEN
        INSERT INTO public.forms (company_id, name, slug, description, status, settings, type)
        VALUES (p_company_id, p_name, p_slug, p_description, p_status, p_settings, p_type)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.forms 
        SET name = p_name,
            slug = p_slug,
            description = p_description,
            status = p_status,
            settings = p_settings,
            type = p_type,
            updated_at = now()
        WHERE id = p_form_id AND company_id = p_company_id
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

-- Otimização da save_form_fields_delta_v1 com SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.save_form_fields_delta_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_fields_upsert JSONB,
    p_fields_delete UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Validação de Permissão Manual
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- Delete
    IF p_fields_delete IS NOT NULL AND array_length(p_fields_delete, 1) > 0 THEN
        DELETE FROM public.form_fields 
        WHERE id = ANY(p_fields_delete) AND form_id = p_form_id;
    END IF;

    -- Upsert
    IF p_fields_upsert IS NOT NULL AND jsonb_array_length(p_fields_upsert) > 0 THEN
        INSERT INTO public.form_fields (
            id, form_id, company_id, label, name, type, required, 
            placeholder, sort_order, step_number, step_id, 
            validation_rules, logic_rules, score_rules
        )
        SELECT 
            COALESCE((m->>'id')::UUID, gen_random_uuid()),
            p_form_id,
            p_company_id,
            m->>'label',
            m->>'name',
            m->>'type',
            COALESCE((m->>'required')::BOOLEAN, false),
            m->>'placeholder',
            COALESCE((m->>'sort_order')::INTEGER, 0),
            COALESCE((m->>'step_number')::INTEGER, 1),
            (NULLIF(m->>'step_id', ''))::UUID,
            COALESCE((m->'validation_rules'), '{}'::jsonb),
            COALESCE((m->'logic_rules'), '{}'::jsonb),
            COALESCE((m->'score_rules'), '{}'::jsonb)
        FROM jsonb_array_elements(p_fields_upsert) AS m
        ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            required = EXCLUDED.required,
            placeholder = EXCLUDED.placeholder,
            sort_order = EXCLUDED.sort_order,
            step_number = EXCLUDED.step_number,
            step_id = EXCLUDED.step_id,
            validation_rules = EXCLUDED.validation_rules,
            logic_rules = EXCLUDED.logic_rules,
            score_rules = EXCLUDED.score_rules,
            updated_at = now();
    END IF;
END;
$$;

-- Otimização da save_form_options_delta_v1 com SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.save_form_options_delta_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_field_id UUID,
    p_options_upsert JSONB,
    p_options_delete UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Validação de Permissão Rápida
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- Delete
    IF p_options_delete IS NOT NULL AND array_length(p_options_delete, 1) > 0 THEN
        DELETE FROM public.form_field_options 
        WHERE id = ANY(p_options_delete) 
        AND field_id = p_field_id;
    END IF;

    -- Upsert
    IF p_options_upsert IS NOT NULL AND jsonb_array_length(p_options_upsert) > 0 THEN
        INSERT INTO public.form_field_options (
            id, company_id, form_id, field_id, label, value, score, tag, sort_order, metadata
        )
        SELECT 
            COALESCE((opt->>'id')::UUID, gen_random_uuid()),
            p_company_id,
            p_form_id,
            p_field_id,
            opt->>'label',
            COALESCE(opt->>'value', lower(regexp_replace(opt->>'label', '[^a-zA-Z0-9]+', '_', 'g'))),
            COALESCE((opt->>'score')::INTEGER, 0),
            opt->>'tag',
            COALESCE((opt->>'sort_order')::INTEGER, 0),
            COALESCE(opt->'metadata', '{}'::jsonb)
        FROM jsonb_array_elements(p_options_upsert) AS opt
        ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            value = EXCLUDED.value,
            score = EXCLUDED.score,
            tag = EXCLUDED.tag,
            sort_order = EXCLUDED.sort_order,
            metadata = EXCLUDED.metadata,
            updated_at = now();
    END IF;
END;
$$;

-- Adição de índices extras para acelerar RLS e Joins em cenários de alta carga
CREATE INDEX IF NOT EXISTS idx_form_field_options_field_id ON public.form_field_options(field_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON public.form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_forms_company_id ON public.forms(company_id);
