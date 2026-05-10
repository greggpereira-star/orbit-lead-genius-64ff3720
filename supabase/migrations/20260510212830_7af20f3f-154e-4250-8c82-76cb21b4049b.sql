CREATE OR REPLACE FUNCTION public.save_form_fields_delta_v1(
    p_form_id uuid,
    p_company_id uuid,
    p_fields_upsert jsonb,
    p_fields_delete uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = v_user_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.forms
        WHERE id = p_form_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Formulário não encontrado para esta empresa' USING ERRCODE = 'P0002';
    END IF;

    IF p_fields_delete IS NOT NULL AND array_length(p_fields_delete, 1) > 0 THEN
        DELETE FROM public.form_field_options
        WHERE form_id = p_form_id
          AND company_id = p_company_id
          AND field_id = ANY(p_fields_delete);

        DELETE FROM public.form_fields
        WHERE form_id = p_form_id
          AND company_id = p_company_id
          AND id = ANY(p_fields_delete);
    END IF;

    IF p_fields_upsert IS NOT NULL AND jsonb_array_length(p_fields_upsert) > 0 THEN
        INSERT INTO public.form_fields (
            id,
            form_id,
            company_id,
            label,
            name,
            type,
            required,
            placeholder,
            options,
            sort_order,
            step_number,
            step_id,
            validation_rules,
            logic_rules,
            score_rules,
            updated_at
        )
        SELECT
            CASE
                WHEN (m->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (m->>'id')::uuid
                ELSE gen_random_uuid()
            END,
            p_form_id,
            p_company_id,
            COALESCE(NULLIF(m->>'label', ''), 'Campo'),
            COALESCE(NULLIF(m->>'name', ''), 'field_' || ordinality),
            COALESCE(NULLIF(m->>'type', ''), 'text'),
            COALESCE((m->>'required')::boolean, false),
            COALESCE(m->>'placeholder', ''),
            COALESCE(m->'options', '[]'::jsonb),
            COALESCE((m->>'sort_order')::integer, ordinality - 1),
            COALESCE((m->>'step_number')::integer, 1),
            CASE
                WHEN NULLIF(m->>'step_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (m->>'step_id')::uuid
                ELSE NULL
            END,
            COALESCE(m->'validation_rules', '{}'::jsonb),
            COALESCE(m->'logic_rules', '{}'::jsonb),
            COALESCE(m->'score_rules', '{}'::jsonb),
            now()
        FROM jsonb_array_elements(p_fields_upsert) WITH ORDINALITY AS input(m, ordinality)
        ON CONFLICT (id) DO UPDATE SET
            form_id = EXCLUDED.form_id,
            company_id = EXCLUDED.company_id,
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
            updated_at = now()
        WHERE public.form_fields.form_id = p_form_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_form_options_batch_v1(
    p_form_id uuid,
    p_company_id uuid,
    p_options_by_field jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_field jsonb;
    v_field_id uuid;
    v_upserted integer := 0;
    v_deleted integer := 0;
    v_field_count integer := 0;
    v_rows integer := 0;
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = v_user_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.forms
        WHERE id = p_form_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Formulário não encontrado para esta empresa' USING ERRCODE = 'P0002';
    END IF;

    IF p_options_by_field IS NULL OR jsonb_array_length(p_options_by_field) = 0 THEN
        RETURN jsonb_build_object('status', 'success', 'fields', 0, 'deleted', 0, 'upserted', 0);
    END IF;

    FOR v_field IN SELECT * FROM jsonb_array_elements(p_options_by_field)
    LOOP
        IF NOT ((v_field->>'field_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
            CONTINUE;
        END IF;

        v_field_id := (v_field->>'field_id')::uuid;

        IF NOT EXISTS (
            SELECT 1
            FROM public.form_fields
            WHERE id = v_field_id
              AND form_id = p_form_id
              AND company_id = p_company_id
        ) THEN
            CONTINUE;
        END IF;

        DELETE FROM public.form_field_options
        WHERE form_id = p_form_id
          AND company_id = p_company_id
          AND field_id = v_field_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_deleted := v_deleted + v_rows;

        IF COALESCE(jsonb_array_length(v_field->'options'), 0) > 0 THEN
            INSERT INTO public.form_field_options (
                id,
                company_id,
                form_id,
                field_id,
                label,
                value,
                score,
                tag,
                sort_order,
                metadata,
                updated_at
            )
            SELECT
                CASE
                    WHEN (opt->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (opt->>'id')::uuid
                    ELSE gen_random_uuid()
                END,
                p_company_id,
                p_form_id,
                v_field_id,
                COALESCE(NULLIF(opt->>'label', ''), 'Opção'),
                COALESCE(NULLIF(opt->>'value', ''), lower(regexp_replace(COALESCE(NULLIF(opt->>'label', ''), 'opcao'), '[^a-zA-Z0-9]+', '_', 'g'))),
                COALESCE((opt->>'score')::integer, 0),
                NULLIF(opt->>'tag', ''),
                COALESCE((opt->>'sort_order')::integer, ordinality - 1),
                COALESCE(opt->'metadata', '{}'::jsonb),
                now()
            FROM jsonb_array_elements(v_field->'options') WITH ORDINALITY AS input(opt, ordinality)
            ON CONFLICT (id) DO UPDATE SET
                company_id = EXCLUDED.company_id,
                form_id = EXCLUDED.form_id,
                field_id = EXCLUDED.field_id,
                label = EXCLUDED.label,
                value = EXCLUDED.value,
                score = EXCLUDED.score,
                tag = EXCLUDED.tag,
                sort_order = EXCLUDED.sort_order,
                metadata = EXCLUDED.metadata,
                updated_at = now();
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_upserted := v_upserted + v_rows;
        END IF;

        UPDATE public.form_fields
        SET options = COALESCE(v_field->'options', '[]'::jsonb),
            updated_at = now()
        WHERE id = v_field_id
          AND form_id = p_form_id
          AND company_id = p_company_id;

        v_field_count := v_field_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'fields', v_field_count,
        'deleted', v_deleted,
        'upserted', v_upserted
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_form_options_delta_v1(
    p_form_id uuid,
    p_company_id uuid,
    p_field_id uuid,
    p_options_upsert jsonb,
    p_options_delete uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = v_user_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    PERFORM public.save_form_options_batch_v1(
        p_form_id,
        p_company_id,
        jsonb_build_array(jsonb_build_object(
            'field_id', p_field_id,
            'options', COALESCE(p_options_upsert, '[]'::jsonb)
        ))
    );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_forms_company_updated ON public.forms(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_fields_company_form_sort ON public.form_fields(company_id, form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_sort ON public.form_fields(form_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_field_options_company_form_field_sort ON public.form_field_options(company_id, form_id, field_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_memberships_user_company ON public.memberships(user_id, company_id);

UPDATE public.form_fields ff
SET company_id = f.company_id
FROM public.forms f
WHERE ff.form_id = f.id
  AND ff.company_id IS NULL;

UPDATE public.form_steps fs
SET company_id = f.company_id
FROM public.forms f
WHERE fs.form_id = f.id
  AND fs.company_id IS NULL;

UPDATE public.form_fields ff
SET options = COALESCE(src.options_json, '[]'::jsonb),
    updated_at = now()
FROM (
    SELECT field_id, jsonb_agg(
        jsonb_build_object(
            'id', id,
            'label', label,
            'value', value,
            'score', COALESCE(score, 0),
            'tag', tag,
            'sort_order', sort_order,
            'metadata', COALESCE(metadata, '{}'::jsonb)
        ) ORDER BY sort_order
    ) AS options_json
    FROM public.form_field_options
    GROUP BY field_id
) src
WHERE ff.id = src.field_id;