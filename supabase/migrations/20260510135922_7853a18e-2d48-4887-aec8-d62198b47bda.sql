-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.save_form_v2(uuid, uuid, jsonb, jsonb, jsonb);

-- Optimized Form Save RPC v3
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
    -- 1. Authorization Check (Manual check to keep function SECURITY DEFINER but safe)
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

    -- 3. UPSERT Steps
    IF p_steps IS NOT NULL AND jsonb_array_length(p_steps) > 0 THEN
        INSERT INTO public.form_steps (
            id, form_id, title, description, sort_order, button_text, conditional_logic, updated_at
        )
        SELECT 
            CASE 
                WHEN s->>'id' IS NOT NULL AND s->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN (s->>'id')::uuid 
                ELSE gen_random_uuid() 
            END,
            p_form_id,
            COALESCE(s->>'title', 'Step'),
            s->>'description',
            COALESCE((s->>'sort_order')::int, 0),
            COALESCE(s->>'button_text', 'Next'),
            COALESCE(s->'conditional_logic', '{}'::jsonb),
            NOW()
        FROM jsonb_array_elements(p_steps) AS s
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            button_text = EXCLUDED.button_text,
            conditional_logic = EXCLUDED.conditional_logic,
            updated_at = NOW();

        -- Optimized Cleanup
        DELETE FROM public.form_steps 
        WHERE form_id = p_form_id 
        AND id NOT IN (
            SELECT (s->>'id')::uuid 
            FROM jsonb_array_elements(p_steps) s 
            WHERE s->>'id' IS NOT NULL AND s->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        );
    ELSE
        DELETE FROM public.form_steps WHERE form_id = p_form_id;
    END IF;
    
    v_perf_log := jsonb_set(v_perf_log, '{steps_sync_ms}', to_jsonb(EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))));

    -- 4. UPSERT Fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            id, form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, step_id,
            validation_rules, logic_rules, score_rules, updated_at
        )
        SELECT 
            CASE 
                WHEN f->>'id' IS NOT NULL AND f->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN (f->>'id')::uuid 
                ELSE gen_random_uuid() 
            END,
            p_form_id,
            COALESCE(f->>'label', 'Field'),
            COALESCE(f->>'name', 'field_' || (row_number() OVER ())),
            COALESCE(f->>'type', 'text'),
            COALESCE((f->>'required')::boolean, false),
            f->>'placeholder',
            COALESCE(f->'options', '[]'::jsonb),
            COALESCE((f->>'sort_order')::int, 0),
            COALESCE((f->>'step_number')::int, 1),
            CASE 
                WHEN f->>'step_id' IS NOT NULL AND f->>'step_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN (f->>'step_id')::uuid 
                ELSE NULL 
            END,
            COALESCE(f->'validation_rules', '{}'::jsonb),
            COALESCE(f->'logic_rules', '{}'::jsonb),
            COALESCE(f->'score_rules', '{}'::jsonb),
            NOW()
        FROM jsonb_array_elements(p_fields) AS f
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
            updated_at = NOW();

        -- Optimized Cleanup
        DELETE FROM public.form_fields 
        WHERE form_id = p_form_id 
        AND id NOT IN (
            SELECT (f->>'id')::uuid 
            FROM jsonb_array_elements(p_fields) f 
            WHERE f->>'id' IS NOT NULL AND f->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        );
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