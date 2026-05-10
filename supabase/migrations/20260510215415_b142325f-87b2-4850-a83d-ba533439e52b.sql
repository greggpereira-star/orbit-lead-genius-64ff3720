CREATE OR REPLACE FUNCTION public.save_form_builder_v1(
    p_form_id uuid,
    p_company_id uuid,
    p_form_data jsonb,
    p_fields jsonb DEFAULT '[]'::jsonb,
    p_steps jsonb DEFAULT '[]'::jsonb,
    p_options_by_field jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_form_id uuid;
    v_trace_id text := 'form_save_' || replace(gen_random_uuid()::text, '-', '');
    v_field_count integer := 0;
    v_step_count integer := 0;
    v_option_count integer := 0;
    v_deleted_options integer := 0;
    v_started_at timestamptz := clock_timestamp();
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = v_user_id
          AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    IF p_form_id IS NULL THEN
        INSERT INTO public.forms (company_id, name, slug, description, status, settings, type, updated_at)
        VALUES (
            p_company_id,
            COALESCE(NULLIF(p_form_data->>'name', ''), 'Untitled Form'),
            COALESCE(NULLIF(p_form_data->>'slug', ''), 'form-' || substring(gen_random_uuid()::text from 1 for 8)),
            NULLIF(p_form_data->>'description', ''),
            COALESCE(NULLIF(p_form_data->>'status', ''), 'draft'),
            COALESCE(p_form_data->'settings', '{}'::jsonb),
            COALESCE(NULLIF(p_form_data->>'type', ''), 'standard'),
            now()
        )
        RETURNING id INTO v_form_id;
    ELSE
        UPDATE public.forms
        SET name = COALESCE(NULLIF(p_form_data->>'name', ''), name),
            slug = COALESCE(NULLIF(p_form_data->>'slug', ''), slug),
            description = NULLIF(p_form_data->>'description', ''),
            status = COALESCE(NULLIF(p_form_data->>'status', ''), status),
            settings = COALESCE(p_form_data->'settings', settings),
            type = COALESCE(NULLIF(p_form_data->>'type', ''), type),
            updated_at = now()
        WHERE id = p_form_id
          AND company_id = p_company_id
        RETURNING id INTO v_form_id;

        IF v_form_id IS NULL THEN
            RAISE EXCEPTION 'Formulário não encontrado para esta empresa' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF p_steps IS NOT NULL AND jsonb_array_length(p_steps) > 0 THEN
        WITH step_input AS (
            SELECT
                CASE
                    WHEN (step_item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (step_item->>'id')::uuid
                    ELSE gen_random_uuid()
                END AS id,
                COALESCE(NULLIF(step_item->>'title', ''), 'Etapa ' || ordinality) AS title,
                NULLIF(step_item->>'description', '') AS description,
                COALESCE((step_item->>'sort_order')::integer, ordinality - 1) AS sort_order,
                COALESCE(NULLIF(step_item->>'button_text', ''), 'Avançar') AS button_text,
                COALESCE(step_item->'conditional_logic', '{}'::jsonb) AS conditional_logic
            FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS input(step_item, ordinality)
        ), upserted_steps AS (
            INSERT INTO public.form_steps (
                id, form_id, company_id, title, description, sort_order, button_text, conditional_logic, updated_at
            )
            SELECT id, v_form_id, p_company_id, title, description, sort_order, button_text, conditional_logic, now()
            FROM step_input
            ON CONFLICT (id) DO UPDATE SET
                form_id = EXCLUDED.form_id,
                company_id = EXCLUDED.company_id,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                sort_order = EXCLUDED.sort_order,
                button_text = EXCLUDED.button_text,
                conditional_logic = EXCLUDED.conditional_logic,
                updated_at = now()
            RETURNING id
        )
        DELETE FROM public.form_steps
        WHERE form_id = v_form_id
          AND id NOT IN (SELECT id FROM upserted_steps);

        SELECT count(*) INTO v_step_count FROM public.form_steps WHERE form_id = v_form_id;
    ELSE
        DELETE FROM public.form_steps WHERE form_id = v_form_id;
    END IF;

    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        WITH field_input AS (
            SELECT
                CASE
                    WHEN (field_item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (field_item->>'id')::uuid
                    ELSE gen_random_uuid()
                END AS id,
                COALESCE(NULLIF(field_item->>'label', ''), 'Campo') AS label,
                COALESCE(NULLIF(field_item->>'name', ''), 'field_' || ordinality) AS name,
                COALESCE(NULLIF(field_item->>'type', ''), 'text') AS type,
                COALESCE((field_item->>'required')::boolean, false) AS required,
                COALESCE(field_item->>'placeholder', '') AS placeholder,
                COALESCE(field_item->'options', '[]'::jsonb) AS options,
                COALESCE((field_item->>'sort_order')::integer, ordinality - 1) AS sort_order,
                COALESCE((field_item->>'step_number')::integer, 1) AS step_number,
                CASE
                    WHEN NULLIF(field_item->>'step_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (field_item->>'step_id')::uuid
                    ELSE NULL
                END AS step_id,
                COALESCE(field_item->'validation_rules', '{}'::jsonb) AS validation_rules,
                COALESCE(field_item->'logic_rules', '{}'::jsonb) AS logic_rules,
                COALESCE(field_item->'score_rules', '{}'::jsonb) AS score_rules
            FROM jsonb_array_elements(p_fields) WITH ORDINALITY AS input(field_item, ordinality)
        ), upserted_fields AS (
            INSERT INTO public.form_fields (
                id, form_id, company_id, label, name, type, required, placeholder,
                options, sort_order, step_number, step_id, validation_rules, logic_rules, score_rules, updated_at
            )
            SELECT
                id, v_form_id, p_company_id, label, name, type, required, placeholder,
                options, sort_order, step_number, step_id, validation_rules, logic_rules, score_rules, now()
            FROM field_input
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
            WHERE public.form_fields.form_id = v_form_id
               OR public.form_fields.form_id IS NULL
            RETURNING id
        )
        DELETE FROM public.form_fields
        WHERE form_id = v_form_id
          AND id NOT IN (SELECT id FROM upserted_fields);
    ELSE
        DELETE FROM public.form_fields WHERE form_id = v_form_id;
    END IF;

    DELETE FROM public.form_field_options
    WHERE form_id = v_form_id
      AND company_id = p_company_id;
    GET DIAGNOSTICS v_deleted_options = ROW_COUNT;

    IF p_options_by_field IS NOT NULL AND jsonb_array_length(p_options_by_field) > 0 THEN
        WITH option_input AS (
            SELECT
                CASE
                    WHEN (opt->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (opt->>'id')::uuid
                    ELSE gen_random_uuid()
                END AS id,
                (field_group->>'field_id')::uuid AS field_id,
                COALESCE(NULLIF(opt->>'label', ''), 'Opção') AS label,
                COALESCE(NULLIF(opt->>'value', ''), lower(regexp_replace(COALESCE(NULLIF(opt->>'label', ''), 'opcao'), '[^a-zA-Z0-9]+', '_', 'g'))) AS value,
                COALESCE((opt->>'score')::integer, 0) AS score,
                NULLIF(opt->>'tag', '') AS tag,
                COALESCE((opt->>'sort_order')::integer, opt_ordinality - 1) AS sort_order,
                COALESCE(opt->'metadata', '{}'::jsonb) AS metadata
            FROM jsonb_array_elements(p_options_by_field) AS groups(field_group)
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(field_group->'options', '[]'::jsonb)) WITH ORDINALITY AS options(opt, opt_ordinality)
            WHERE (field_group->>'field_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ), valid_options AS (
            SELECT oi.*
            FROM option_input oi
            JOIN public.form_fields ff ON ff.id = oi.field_id
             AND ff.form_id = v_form_id
             AND ff.company_id = p_company_id
        ), inserted_options AS (
            INSERT INTO public.form_field_options (
                id, company_id, form_id, field_id, label, value, score, tag, sort_order, metadata, updated_at
            )
            SELECT id, p_company_id, v_form_id, field_id, label, value, score, tag, sort_order, metadata, now()
            FROM valid_options
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
                updated_at = now()
            RETURNING id, field_id, label, value, score, tag, sort_order, metadata
        ), options_json AS (
            SELECT
                field_id,
                jsonb_agg(
                    jsonb_build_object(
                        'id', id,
                        'label', label,
                        'value', value,
                        'score', score,
                        'tag', tag,
                        'sort_order', sort_order,
                        'metadata', metadata
                    ) ORDER BY sort_order
                ) AS options
            FROM inserted_options
            GROUP BY field_id
        )
        UPDATE public.form_fields ff
        SET options = COALESCE(oj.options, '[]'::jsonb),
            updated_at = now()
        FROM options_json oj
        WHERE ff.id = oj.field_id
          AND ff.form_id = v_form_id
          AND ff.company_id = p_company_id;
    END IF;

    UPDATE public.form_fields
    SET options = '[]'::jsonb,
        updated_at = now()
    WHERE form_id = v_form_id
      AND company_id = p_company_id
      AND type = 'select'
      AND id NOT IN (
          SELECT (field_group->>'field_id')::uuid
          FROM jsonb_array_elements(COALESCE(p_options_by_field, '[]'::jsonb)) AS groups(field_group)
          WHERE (field_group->>'field_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );

    SELECT count(*) INTO v_field_count FROM public.form_fields WHERE form_id = v_form_id;
    SELECT count(*) INTO v_option_count FROM public.form_field_options WHERE form_id = v_form_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'trace_id', v_trace_id,
        'form_id', v_form_id,
        'fields', v_field_count,
        'steps', v_step_count,
        'options', v_option_count,
        'deleted_options', v_deleted_options,
        'duration_ms', round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)
    );
END;
$function$;