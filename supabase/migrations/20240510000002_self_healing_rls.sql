-- Allow users to create their own company during self-healing
DROP POLICY IF EXISTS "Users can create their own companies" ON companies;
CREATE POLICY "Users can create their own companies" ON companies 
FOR INSERT WITH CHECK (true);

-- Allow users to create their own membership during self-healing
DROP POLICY IF EXISTS "Users can create their own memberships" ON memberships;
CREATE POLICY "Users can create their own memberships" ON memberships 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles 
FOR INSERT WITH CHECK (auth.uid() = id);
