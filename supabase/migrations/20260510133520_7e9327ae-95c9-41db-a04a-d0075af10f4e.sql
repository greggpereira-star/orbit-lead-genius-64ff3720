-- Optimize companies SELECT policy
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies" 
ON public.companies 
FOR SELECT 
USING (check_membership(id));

-- Optimize profiles SELECT policies
DROP POLICY IF EXISTS "Users can view profiles of tenant members" ON public.profiles;
CREATE POLICY "Users can view profiles of tenant members" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM public.memberships m1 
    WHERE m1.user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM public.memberships m2 
      WHERE m2.company_id = m1.company_id 
      AND m2.user_id = profiles.id
    )
  )
);

-- Create a more efficient membership check function if needed
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS TABLE (company_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT company_id FROM public.memberships WHERE user_id = auth.uid();
$$;

-- Update memberships policy to be even simpler
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.memberships;
CREATE POLICY "Users can view their own memberships" 
ON public.memberships 
FOR SELECT 
USING (auth.uid() = user_id);
