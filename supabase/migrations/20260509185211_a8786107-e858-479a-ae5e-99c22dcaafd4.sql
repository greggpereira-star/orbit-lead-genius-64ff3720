-- Drop existing overlapping policies to start clean
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 1. SELECT: Users can only read their own profile
-- Note: We restrict this to own profile for security. 
-- If global visibility is needed, change to (true), but for multi-tenant, own profile is safer.
CREATE POLICY "Profiles: users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- 2. INSERT: Users can create their own profile
CREATE POLICY "Profiles: users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- 3. UPDATE: Users can update their own profile
CREATE POLICY "Profiles: users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

-- 4. DELETE: Users can delete their own profile
CREATE POLICY "Profiles: users can delete their own profile" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = id);

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
