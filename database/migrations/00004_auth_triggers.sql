 -- Trigger to create a default company and membership for new users
 -- Note: In a real production app, we might want a more controlled onboarding flow,
 -- but for this SaaS foundation, we'll automate the initial setup.
 
 CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS TRIGGER AS $$
 DECLARE
     new_company_id UUID;
 BEGIN
     -- 1. Create a default company for the user
     INSERT INTO public.companies (name, slug)
     VALUES (
         COALESCE(new.raw_user_meta_data->>'company_name', 'My Enterprise'),
         LOWER(REPLACE(COALESCE(new.raw_user_meta_data->>'company_name', 'my-enterprise-' || substring(new.id::text, 1, 8)), ' ', '-'))
     )
     RETURNING id INTO new_company_id;
 
     -- 2. Create the membership
     INSERT INTO public.memberships (company_id, user_id, role)
     VALUES (new_company_id, new.id, 'owner');
 
     RETURN new;
 END;
 $$ LANGUAGE plpgsql SECURITY DEFINER;
 
 -- Trigger on auth.users (managed by Supabase)
 -- This requires the trigger to be in the 'auth' schema context or handled via migrations
 -- Since we can't always create triggers directly on 'auth.users' from migration files in some environments,
 -- we use the standard approach for Supabase.
 
 DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
 CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users
   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();