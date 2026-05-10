-- 1. Optimized Form Save RPC v4 (CTE Based)
CREATE OR REPLACE FUNCTION public.save_form_v2(
    p_form_id uuid,
    p_company_id uuid,
    p_form_data jsonb,
    p_steps jsonb DEFAULT '[]'::jsonb,
    p_fields jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_form_company_id uuid;
    v_start_time timestamptz := clock_timestamp();
    v_perf_log jsonb := '{}'::jsonb;
BEGIN
    -- 1. Authorization Check
    SELECT company_id INTO v_form_company_id FROM public.forms WHERE id = p_form_id;
    
    IF v_form_company_id IS NULL THEN
        v_form_company_id := p_company_id;
    END IF;

    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = v_form_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- 2. Update Form Metadata
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(NULLIF(p_form_data->>'slug', ''), slug),
        status = COALESCE(p_form_data->>'status', status),
        settings = COALESCE(p_form_data->'settings', settings),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;
    
    v_perf_log := jsonb_set(v_perf_log, '{form_update_ms}', to_jsonb(EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))));

    -- 3. Sync Steps using CTEs to avoid SRF in WHERE
    IF p_steps IS NOT NULL AND jsonb_array_length(p_steps) > 0 THEN
        WITH step_data AS (
            SELECT 
                CASE 
                    WHEN (s->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                    THEN (s->>'id')::uuid 
                    ELSE gen_random_uuid() 
                END as id,
                p_form_id as form_id,
                COALESCE(s->>'title', 'Step') as title,
                s->>'description' as description,
                COALESCE((s->>'sort_order')::int, 0) as sort_order,
                COALESCE(s->>'button_text', 'Next') as button_text,
                COALESCE(s->'conditional_logic', '{}'::jsonb) as conditional_logic
            FROM jsonb_array_elements(p_steps) AS s
        ),
        upsert_steps AS (
            INSERT INTO public.form_steps (
                id, form_id, title, description, sort_order, button_text, conditional_logic, updated_at
            )
            SELECT id, form_id, title, description, sort_order, button_text, conditional_logic, NOW()
            FROM step_data
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                sort_order = EXCLUDED.sort_order,
                button_text = EXCLUDED.button_text,
                conditional_logic = EXCLUDED.conditional_logic,
                updated_at = NOW()
            RETURNING id
        )
        DELETE FROM public.form_steps 
        WHERE form_id = p_form_id 
        AND id NOT IN (SELECT id FROM step_data);
    ELSE
        DELETE FROM public.form_steps WHERE form_id = p_form_id;
    END IF;
    
    v_perf_log := jsonb_set(v_perf_log, '{steps_sync_ms}', to_jsonb(EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))));

    -- 4. Sync Fields using CTEs to avoid SRF in WHERE
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        WITH field_data AS (
            SELECT 
                CASE 
                    WHEN (f->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                    THEN (f->>'id')::uuid 
                    ELSE gen_random_uuid() 
                END as id,
                p_form_id as form_id,
                COALESCE(f->>'label', 'Field') as label,
                COALESCE(f->>'name', 'field_' || row_number() OVER ()) as name,
                COALESCE(f->>'type', 'text') as type,
                COALESCE((f->>'required')::boolean, false) as required,
                f->>'placeholder' as placeholder,
                COALESCE(f->'options', '[]'::jsonb) as options,
                COALESCE((f->>'sort_order')::int, 0) as sort_order,
                COALESCE((f->>'step_number')::int, 1) as step_number,
                CASE 
                    WHEN (f->>'step_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                    THEN (f->>'step_id')::uuid 
                    ELSE NULL 
                END as step_id,
                COALESCE(f->'validation_rules', '{}'::jsonb) as validation_rules,
                COALESCE(f->'logic_rules', '{}'::jsonb) as logic_rules,
                COALESCE(f->'score_rules', '{}'::jsonb) as score_rules
            FROM jsonb_array_elements(p_fields) AS f
        ),
        upsert_fields AS (
            INSERT INTO public.form_fields (
                id, form_id, label, name, type, required, placeholder, 
                options, sort_order, step_number, step_id,
                validation_rules, logic_rules, score_rules, updated_at
            )
            SELECT 
                id, form_id, label, name, type, required, placeholder, 
                options, sort_order, step_number, step_id,
                validation_rules, logic_rules, score_rules, NOW()
            FROM field_data
            ON CONFLICT (id) DO UPDATE SET
                label = EXCLUDED.label,
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                required = EXCLUDED.required,
                placeholder = EXCLUDED.placeholder,
                options = EXCLUDED.options,
                sort_order = EXCLUDED.sort_order,
                step_number = EXCLUDED.step_number,
                step_id = EXCLUDED.step_id,
                validation_rules = EXCLUDED.validation_rules,
                logic_rules = EXCLUDED.logic_rules,
                score_rules = EXCLUDED.score_rules,
                updated_at = NOW()
            RETURNING id
        )
        DELETE FROM public.form_fields 
        WHERE form_id = p_form_id 
        AND id NOT IN (SELECT id FROM field_data);
    ELSE
        DELETE FROM public.form_fields WHERE form_id = p_form_id;
    END IF;

    v_perf_log := jsonb_set(v_perf_log, '{fields_sync_ms}', to_jsonb(EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))));
    v_perf_log := jsonb_set(v_perf_log, '{total_duration_ms}', to_jsonb(EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))));
    
    RETURN jsonb_build_object(
        'status', 'success',
        'performance', v_perf_log
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Optimized Form Creation RPC (CTE Based)
CREATE OR REPLACE FUNCTION public.create_form_with_fields(
    p_tenant_id uuid,
    p_form_data jsonb,
    p_fields jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
    v_form_id uuid;
    v_user_id uuid := auth.uid();
BEGIN
    -- 1. Authorization Check
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- 2. Insert Form
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

    -- 3. Bulk Insert Fields using CTEs
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        WITH field_data AS (
            SELECT 
                v_form_id as form_id,
                COALESCE(f->>'label', 'Field') as label,
                COALESCE(f->>'name', 'field_' || row_number() OVER ()) as name,
                COALESCE(f->>'type', 'text') as type,
                COALESCE((f->>'required')::boolean, false) as required,
                f->>'placeholder' as placeholder,
                COALESCE(f->'options', '[]'::jsonb) as options,
                COALESCE((f->>'sort_order')::int, 0) as sort_order,
                COALESCE((f->>'step_number')::int, 1) as step_number,
                COALESCE(f->'validation_rules', '{}'::jsonb) as validation_rules,
                COALESCE(f->'logic_rules', '{}'::jsonb) as logic_rules,
                COALESCE(f->'score_rules', '{}'::jsonb) as score_rules
            FROM jsonb_array_elements(p_fields) AS f
        )
        INSERT INTO public.form_fields (
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules, updated_at
        )
        SELECT 
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules, NOW()
        FROM field_data;
    END IF;

    RETURN v_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;