CREATE OR REPLACE FUNCTION public.get_workspace_context_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_profile jsonb;
    v_company jsonb;
    v_membership jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url
    )
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_user_id;

    SELECT
        jsonb_build_object(
            'id', m.id,
            'user_id', m.user_id,
            'company_id', m.company_id,
            'role', m.role
        ),
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug
        )
    INTO v_membership, v_company
    FROM public.memberships m
    JOIN public.companies c ON c.id = m.company_id
    WHERE m.user_id = v_user_id
    ORDER BY m.created_at ASC NULLS LAST
    LIMIT 1;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'membership', v_membership,
        'company', v_company
    );
END;
$$;