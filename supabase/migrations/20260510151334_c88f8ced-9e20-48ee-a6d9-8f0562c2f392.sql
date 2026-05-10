-- 1. ESTRUTURA: Adicionar company_id onde falta (OPÇÃO B - DENORMALIZAÇÃO PARA PERFORMANCE)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_fields' AND column_name = 'company_id') THEN
        ALTER TABLE public.form_fields ADD COLUMN company_id uuid;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_steps' AND column_name = 'company_id') THEN
        ALTER TABLE public.form_steps ADD COLUMN company_id uuid;
    END IF;
END $$;

-- 2. DADOS: Sincronizar company_id das tabelas filhas
UPDATE public.form_fields ff
SET company_id = f.company_id
FROM public.forms f
WHERE ff.form_id = f.id AND ff.company_id IS NULL;

UPDATE public.form_steps fs
SET company_id = f.company_id
FROM public.forms f
WHERE fs.form_id = f.id AND fs.company_id IS NULL;

-- 3. CONSTRAINTS: Garantir que company_id seja obrigatório no futuro e criar índices
CREATE INDEX IF NOT EXISTS idx_form_fields_company_form ON public.form_fields(company_id, form_id);
CREATE INDEX IF NOT EXISTS idx_form_steps_company_form ON public.form_steps(company_id, form_id);

-- 4. RPCs: Recriar funções com schema real e performance
CREATE OR REPLACE FUNCTION public.create_form_with_fields(p_tenant_id uuid, p_form_data jsonb, p_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_form_id uuid;
    v_user_id uuid := auth.uid();
BEGIN
    -- Authorization
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- Insert Form
    INSERT INTO public.forms (
        company_id, name, slug, status, type, settings, description
    ) VALUES (
        p_tenant_id,
        COALESCE(p_form_data->>'name', 'Untitled Form'),
        COALESCE(NULLIF(p_form_data->>'slug', ''), 'form-' || substring(gen_random_uuid()::text from 1 for 8)),
        COALESCE(p_form_data->>'status', 'draft'),
        COALESCE(p_form_data->>'type', 'standard'),
        COALESCE(p_form_data->'settings', '{}'::jsonb),
        p_form_data->>'description'
    ) RETURNING id INTO v_form_id;

    -- Insert Fields
    IF p_fields IS NOT NULL AND jsonb_array_length(p_fields) > 0 THEN
        INSERT INTO public.form_fields (
            form_id, company_id, label, name, type, required, placeholder, 
            options, sort_order, step_number, validation_rules, 
            logic_rules, score_rules, updated_at
        )
        SELECT 
            v_form_id,
            p_tenant_id,
            COALESCE(f->>'label', 'Field'),
            COALESCE(f->>'name', 'field_' || row_number() OVER ()),
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
$function$;

CREATE OR REPLACE FUNCTION public.save_form_fields_delta_v1(p_form_id uuid, p_company_id uuid, p_fields_upsert jsonb, p_fields_delete uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Permission Check
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = v_user_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- Delete
    IF p_fields_delete IS NOT NULL AND array_length(p_fields_delete, 1) > 0 THEN
        DELETE FROM public.form_fields 
        WHERE id = ANY(p_fields_delete) AND company_id = p_company_id;
    END IF;

    -- Upsert using CTE to avoid "set-returning functions are not allowed in WHERE" if ever reused in subqueries
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
            updated_at = now()
        WHERE public.form_fields.company_id = p_company_id;
    END IF;
END;
$function$;

-- 5. POLICIES: Simplificar RLS usando as novas colunas
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company" 
ON public.form_fields 
FOR ALL 
USING (check_membership(company_id));

DROP POLICY IF EXISTS "Users can manage form steps for their forms" ON public.form_steps;
CREATE POLICY "Users can manage form steps of their company" 
ON public.form_steps 
FOR ALL 
USING (check_membership(company_id));
