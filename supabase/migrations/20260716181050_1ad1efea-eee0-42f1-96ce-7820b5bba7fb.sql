
-- 1. routing_configs
CREATE TABLE IF NOT EXISTS public.routing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Distribuição padrão',
  strategy TEXT NOT NULL DEFAULT 'hybrid' CHECK (strategy IN ('round_robin','performance','hybrid')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  fallback_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  hot_threshold INTEGER NOT NULL DEFAULT 70,
  warm_threshold INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routing_configs_company ON public.routing_configs(company_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_configs TO authenticated;
GRANT ALL ON public.routing_configs TO service_role;
ALTER TABLE public.routing_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routing_configs_member_all" ON public.routing_configs
  FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

-- 2. routing_members
CREATE TABLE IF NOT EXISTS public.routing_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.routing_configs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  performance_score INTEGER NOT NULL DEFAULT 50 CHECK (performance_score BETWEEN 0 AND 100),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  last_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (config_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_routing_members_config ON public.routing_members(config_id) WHERE is_available;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_members TO authenticated;
GRANT ALL ON public.routing_members TO service_role;
ALTER TABLE public.routing_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routing_members_member_all" ON public.routing_members
  FOR ALL TO authenticated
  USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

-- 3. leads.assigned_to
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to) WHERE assigned_to IS NOT NULL;

-- 4. updated_at triggers
DROP TRIGGER IF EXISTS trg_routing_configs_updated ON public.routing_configs;
CREATE TRIGGER trg_routing_configs_updated BEFORE UPDATE ON public.routing_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_routing_members_updated ON public.routing_members;
CREATE TRIGGER trg_routing_members_updated BEFORE UPDATE ON public.routing_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RPC thread-safe para escolher próximo vendedor
CREATE OR REPLACE FUNCTION public.pick_next_routing_member(
  p_config_id UUID,
  p_prefer_top BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_user_id UUID;
BEGIN
  IF p_prefer_top THEN
    SELECT id, user_id INTO v_member_id, v_user_id
    FROM public.routing_members
    WHERE config_id = p_config_id AND is_available = true AND performance_score >= 80
    ORDER BY last_assigned_at ASC NULLS FIRST, performance_score DESC
    LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id, user_id INTO v_member_id, v_user_id
    FROM public.routing_members
    WHERE config_id = p_config_id AND is_available = true
    ORDER BY last_assigned_at ASC NULLS FIRST
    LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;

  IF v_member_id IS NOT NULL THEN
    UPDATE public.routing_members SET last_assigned_at = now() WHERE id = v_member_id;
  END IF;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pick_next_routing_member(UUID, BOOLEAN) TO authenticated, service_role;
