-- Convites de equipe: levar uma pessoa nova para a empresa com um papel definido.
--
-- Antes: o cadastro era aberto e CADA cadastro criava a própria empresa; não havia
-- como a empresa trazer alguém para dentro com papel de atendente ou visualizador.
--
-- Como funciona:
--   1. dono/administrador cria o convite (e-mail + papel) pelo servidor; o código
--      secreto sai uma única vez no link e só o HASH (sha256) fica aqui;
--   2. a pessoa abre o link e se cadastra com o MESMO e-mail, levando o código nos
--      metadados do cadastro (`invite_token`);
--   3. ao criar o usuário em auth.users, o gatilho `handle_new_user` chama
--      `vincular_convite_ao_novo_usuario`: valida (hash, e-mail, validade, não usado,
--      não revogado) e cria o vínculo `memberships` já com o papel do convite.
--      O login (WorkspaceOrchestrator) acha o vínculo e NÃO cria empresa nova.
--
-- O cadastro comum não pode quebrar por causa disto: a chamada fica num bloco que
-- engole qualquer erro (a pessoa ainda se cadastra; só não é vinculada).
-- Papel `owner` nunca é convidável. A confirmação de e-mail segue obrigatória
-- (GOTRUE_MAILER_AUTOCONFIRM=false): sem ler o e-mail, ninguém entra.

CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz
);

-- Um convite pendente por e-mail em cada empresa (reenviar = revogar o antigo e criar outro).
CREATE UNIQUE INDEX IF NOT EXISTS company_invites_pendente_idx
  ON public.company_invites (company_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_invites_leitura ON public.company_invites;
CREATE POLICY company_invites_leitura ON public.company_invites
  FOR SELECT TO authenticated USING (public.eh_admin_da_empresa(company_id));
REVOKE ALL ON public.company_invites FROM authenticated, anon;
GRANT SELECT ON public.company_invites TO authenticated;
GRANT ALL ON public.company_invites TO service_role;

CREATE OR REPLACE FUNCTION public.vincular_convite_ao_novo_usuario(
  p_user_id uuid, p_email text, p_meta jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text := p_meta ->> 'invite_token';
  v_inv public.company_invites%ROWTYPE;
BEGIN
  IF v_token IS NULL OR length(v_token) < 20 THEN
    RETURN;
  END IF;

  SELECT * INTO v_inv
    FROM public.company_invites
   WHERE token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
     AND accepted_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > now()
     AND email = lower(btrim(p_email))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.memberships (company_id, user_id, role)
  VALUES (v_inv.company_id, p_user_id, v_inv.role::public.user_role);

  UPDATE public.company_invites
     SET accepted_at = now(), accepted_by = p_user_id
   WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes)
  VALUES (v_inv.company_id, p_user_id, 'convite_aceito', 'convite', v_inv.id,
          jsonb_build_object('email', v_inv.email, 'papel', v_inv.role, 'convidado_por', v_inv.invited_by));
END;
$$;
REVOKE ALL ON FUNCTION public.vincular_convite_ao_novo_usuario(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_convite_ao_novo_usuario(uuid, text, jsonb) TO service_role;

-- O gatilho existente segue igual no que faz (cria o perfil); só ganha a chamada blindada.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  BEGIN
    PERFORM public.vincular_convite_ao_novo_usuario(new.id, new.email, COALESCE(new.raw_user_meta_data, '{}'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'convite não vinculado para %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$function$;
