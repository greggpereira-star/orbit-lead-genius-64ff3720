-- 1. Tabela Dedicada para Options
CREATE TABLE IF NOT EXISTS public.form_field_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    field_id UUID NOT NULL, -- Referência lógica ao ID do field (pode ser temporário no front)
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    tag TEXT,
    sort_order INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para Performance
CREATE INDEX IF NOT EXISTS idx_ffo_company_form ON public.form_field_options(company_id, form_id);
CREATE INDEX IF NOT EXISTS idx_ffo_field_id ON public.form_field_options(field_id);
CREATE INDEX IF NOT EXISTS idx_ffo_field_sort ON public.form_field_options(field_id, sort_order);

-- Habilitar RLS
ALTER TABLE public.form_field_options ENABLE ROW LEVEL SECURITY;

-- Políticas RLS Otimizadas (Usando company_id direto)
CREATE POLICY "Users can view options of their company" 
ON public.form_field_options FOR SELECT 
USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage options of their company" 
ON public.form_field_options FOR ALL 
USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

-- 2. Função: Save Form Core (Apenas metadados do form)
CREATE OR REPLACE FUNCTION public.save_form_core_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_status TEXT,
    p_settings JSONB,
    p_type TEXT DEFAULT 'standard'
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Validação de Permissão Simples
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'Acesso negado';
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função: Save Form Fields Delta (Incremental)
CREATE OR REPLACE FUNCTION public.save_form_fields_delta_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_fields_upsert JSONB, -- Array de fields para insert/update
    p_fields_delete UUID[]  -- Array de IDs para delete
) RETURNS VOID AS $$
BEGIN
    -- Validação de Permissão
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- Delete
    IF array_length(p_fields_delete, 1) > 0 THEN
        DELETE FROM public.form_fields 
        WHERE id = ANY(p_fields_delete) AND form_id = p_form_id;
    END IF;

    -- Upsert usando WITH para evitar SRF no WHERE
    IF jsonb_array_length(p_fields_upsert) > 0 THEN
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
            (m->>'required')::BOOLEAN,
            m->>'placeholder',
            (m->>'sort_order')::INTEGER,
            (m->>'step_number')::INTEGER,
            (m->>'step_id')::UUID,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função: Save Form Options Delta (Tabela dedicada)
CREATE OR REPLACE FUNCTION public.save_form_options_delta_v1(
    p_form_id UUID,
    p_company_id UUID,
    p_field_id UUID,
    p_options_upsert JSONB,
    p_options_delete UUID[]
) RETURNS VOID AS $$
BEGIN
    -- Validação de Permissão
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- Delete
    IF array_length(p_options_delete, 1) > 0 THEN
        DELETE FROM public.form_field_options 
        WHERE id = ANY(p_options_delete) AND field_id = p_field_id;
    END IF;

    -- Upsert
    IF jsonb_array_length(p_options_upsert) > 0 THEN
        INSERT INTO public.form_field_options (
            id, company_id, form_id, field_id, label, value, score, tag, sort_order, metadata
        )
        SELECT 
            COALESCE((m->>'id')::UUID, gen_random_uuid()),
            p_company_id,
            p_form_id,
            p_field_id,
            m->>'label',
            m->>'value',
            COALESCE((m->>'score')::INTEGER, 0),
            m->>'tag',
            (m->>'sort_order')::INTEGER,
            COALESCE((m->'metadata'), '{}'::jsonb)
        FROM jsonb_array_elements(p_options_upsert) AS m
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
