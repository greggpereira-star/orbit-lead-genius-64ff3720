-- 1. Garantir RLS e Políticas Otimizadas para form_field_options
ALTER TABLE public.form_field_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage options of their company" ON public.form_field_options;
DROP POLICY IF EXISTS "Users can view options of their company" ON public.form_field_options;

CREATE POLICY "Users can manage options of their company" 
ON public.form_field_options 
FOR ALL 
USING (check_membership(company_id));

CREATE POLICY "Users can view options of their company" 
ON public.form_field_options 
FOR SELECT 
USING (check_membership(company_id));

-- 2. Refatorar a RPC de opções para máxima performance
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
AS $$
BEGIN
    -- Validação de Permissão Rápida
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() AND company_id = p_company_id
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

-- 3. Corrigir Política de form_fields (usando a relação com forms que tem company_id)
DROP POLICY IF EXISTS "Users can manage form fields of their company forms" ON public.form_fields;
CREATE POLICY "Users can manage form fields of their company forms"
ON public.form_fields
FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_fields.form_id 
    AND check_membership(f.company_id)
));
