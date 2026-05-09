CREATE OR REPLACE FUNCTION public.get_or_create_company(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS public.companies AS $$
DECLARE
    v_company public.companies;
BEGIN
    -- Check if user already has a company through membership
    SELECT c.* INTO v_company
    FROM public.companies c
    JOIN public.memberships m ON m.company_id = c.id
    WHERE m.user_id = p_user_id
    LIMIT 1;

    IF v_company.id IS NOT NULL THEN
        RETURN v_company;
    END IF;

    -- Try to create a new one
    INSERT INTO public.companies (name, slug, created_by)
    VALUES (p_name, p_slug, p_user_id)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING * INTO v_company;

    RETURN v_company;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
