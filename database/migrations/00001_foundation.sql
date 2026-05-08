 -- Foundation migration for Multi-tenant Enterprise CRM
 
 -- Enable necessary extensions
 CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
 
 -- Companies Table
 CREATE TABLE IF NOT EXISTS companies (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name TEXT NOT NULL,
     slug TEXT UNIQUE NOT NULL,
     logo_url TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- User Roles Enum
 CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
 
 -- Memberships Table (Multi-tenant mapping)
 CREATE TABLE IF NOT EXISTS memberships (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     user_id UUID NOT NULL, -- Links to auth.users
     role user_role DEFAULT 'member' NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
     UNIQUE(company_id, user_id)
 );
 
 -- Leads Table
 CREATE TABLE IF NOT EXISTS leads (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
     name TEXT NOT NULL,
     email TEXT,
     phone TEXT,
     city TEXT,
     status TEXT DEFAULT 'new' NOT NULL,
     score INTEGER DEFAULT 0,
     temperature TEXT DEFAULT 'cold', -- cold, warm, hot
     metadata JSONB DEFAULT '{}'::jsonb,
     utm_source TEXT,
     utm_medium TEXT,
     utm_campaign TEXT,
     gclid TEXT,
     fbclid TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 );
 
 -- Enable RLS
 ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
 ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
 ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
 
 -- RLS Policies
 
 -- Memberships: User can see their own memberships
 CREATE POLICY "Users can view their own memberships"
 ON memberships FOR SELECT
 USING (auth.uid() = user_id);
 
 -- Companies: User can see companies they are members of
 CREATE POLICY "Users can view companies they belong to"
 ON companies FOR SELECT
 USING (
     EXISTS (
         SELECT 1 FROM memberships
         WHERE memberships.company_id = companies.id
         AND memberships.user_id = auth.uid()
     )
 );
 
 -- Leads: Access scoped by company_id
 CREATE POLICY "Users can view leads from their companies"
 ON leads FOR SELECT
 USING (
     EXISTS (
         SELECT 1 FROM memberships
         WHERE memberships.company_id = leads.company_id
         AND memberships.user_id = auth.uid()
     )
 );
 
 CREATE POLICY "Users can insert leads into their companies"
 ON leads FOR INSERT
 WITH CHECK (
     EXISTS (
         SELECT 1 FROM memberships
         WHERE memberships.company_id = leads.company_id
         AND memberships.user_id = auth.uid()
     )
 );