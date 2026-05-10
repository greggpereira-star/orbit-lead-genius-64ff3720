-- Drop and recreate create_form_with_fields to optimize it
DROP FUNCTION IF EXISTS public.create_form_with_fields(uuid, jsonb, jsonb);

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
    -- 1. Authorization Check (Manual check to keep function SECURITY DEFINER but safe)
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

    -- 3. Bulk Insert Fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules, updated_at
        )
        SELECT 
            v_form_id,
            COALESCE(f->>'label', 'Field'),
            COALESCE(f->>'name', 'field_' || (row_number() OVER ())),
            COALESCE(f->>'type', 'text'),
            COALESCE((f->>'required')::boolean, false),
            f->>'placeholder',
            COALESCE(f->'options', '[]'::jsonb),
            COALESCE((f->>'sort_order')::int, 0),
            COALESCE((f->>'step_number')::int, 1),
            COALESCE(f->'validation_rules', '{}'::jsonb),
            COALESCE(f->'logic_rules', '{}'::jsonb),
            COALESCE(f->'score_rules', '{}'::jsonb),
            NOW()
        FROM jsonb_array_elements(p_fields) AS f;
    END IF;

    RETURN v_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;