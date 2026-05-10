-- 1. Create optimized indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_form_fields_bulk_lookup ON public.form_fields (form_id, id);
CREATE INDEX IF NOT EXISTS idx_form_steps_bulk_lookup ON public.form_steps (form_id, id);

-- 2. Create optimized RPC for batch form saving
CREATE OR REPLACE FUNCTION public.save_form_v2(
    p_form_id uuid,
    p_company_id uuid,
    p_form_data jsonb,
    p_steps jsonb,
    p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_actual_company_id uuid;
    v_result jsonb;
    v_steps_count int := 0;
    v_fields_count int := 0;
    v_deleted_steps_count int := 0;
    v_deleted_fields_count int := 0;
BEGIN
    -- Authorization Check
    SELECT company_id INTO v_actual_company_id FROM public.forms WHERE id = p_form_id;
    
    -- If form doesn't exist, it might be a new form (though p_form_id is expected for update)
    -- For safety, we check the provided company_id if the form is new or being moved
    IF v_actual_company_id IS NULL THEN
        v_actual_company_id := p_company_id;
    END IF;

    IF v_user_id IS NULL OR NOT public.check_membership_internal(v_actual_company_id, v_user_id) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- 1. Update main form record
    UPDATE public.forms
    SET 
        name = COALESCE(p_form_data->>'name', name),
        slug = COALESCE(NULLIF(p_form_data->>'slug', ''), slug),
        status = COALESCE(p_form_data->>'status', status),
        settings = COALESCE(p_form_data->'settings', settings),
        description = COALESCE(p_form_data->>'description', description),
        updated_at = NOW()
    WHERE id = p_form_id;

    -- 2. Sync Steps (UPSERT + DELETE)
    IF p_steps IS NOT NULL THEN
        -- Upsert current steps
        INSERT INTO public.form_steps (
            id, form_id, title, description, sort_order, button_text, conditional_logic, updated_at
        )
        SELECT 
            COALESCE((s->>'id')::uuid, gen_random_uuid()),
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

        -- Delete steps not in payload
        WITH payload_ids AS (
            SELECT (jsonb_array_elements(p_steps)->>'id')::uuid as id
            WHERE jsonb_array_elements(p_steps)->>'id' IS NOT NULL
        )
        DELETE FROM public.form_steps 
        WHERE form_id = p_form_id 
        AND id NOT IN (SELECT id FROM payload_ids);
        
        GET DIAGNOSTICS v_steps_count = ROW_COUNT;
    END IF;

    -- 3. Sync Fields (UPSERT + DELETE)
    IF p_fields IS NOT NULL THEN
        -- Upsert current fields
        INSERT INTO public.form_fields (
            id, form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, step_id,
            validation_rules, logic_rules, score_rules, updated_at
        )
        SELECT 
            COALESCE((f->>'id')::uuid, gen_random_uuid()),
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

        -- Delete fields not in payload
        WITH payload_ids AS (
            SELECT (jsonb_array_elements(p_fields)->>'id')::uuid as id
            WHERE jsonb_array_elements(p_fields)->>'id' IS NOT NULL
        )
        DELETE FROM public.form_fields 
        WHERE form_id = p_form_id 
        AND id NOT IN (SELECT id FROM payload_ids);

        GET DIAGNOSTICS v_fields_count = ROW_COUNT;
    END IF;

    -- Construct response
    v_result := jsonb_build_object(
        'success', true,
        'form_id', p_form_id,
        'stats', jsonb_build_object(
            'steps_processed', v_steps_count,
            'fields_processed', v_fields_count
        )
    );

    RETURN v_result;
END;
$$;
