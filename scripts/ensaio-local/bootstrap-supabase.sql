-- Imita, num Postgres comum, o que o Supabase entrega por fora das migrações:
-- papéis, schema auth (com as funções que as políticas usam), storage, cron, net
-- e vault. SÓ para ensaio local. Nada aqui vai para produção.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'ensaio'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser login password 'ensaio'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto;
alter database postgres set search_path = public, extensions;
set search_path = public, extensions;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid, aud text default 'authenticated', role text default 'authenticated',
  email text unique, encrypted_password text, email_confirmed_at timestamptz,
  phone text, raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_sign_in_at timestamptz, confirmation_token text, recovery_token text
);
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role') $$;
create or replace function auth.email() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), auth.jwt() ->> 'email') $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), path_tokens text[] generated always as (string_to_array(name, '/')) stored
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create or replace function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create or replace function storage.extension(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '.'))[array_length(string_to_array(name, '.'), 1)] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, schedule text, command text, jobname text unique, active boolean default true);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as
$$ declare i bigint; begin
  insert into cron.job(schedule, command, jobname) values (schedule, command, job_name)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into i; return i; end $$;
create or replace function cron.schedule(schedule text, command text) returns bigint language sql as
  $$ select 0::bigint $$;
create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as
  $$ begin delete from cron.job where jobname = job_name; return true; end $$;
create or replace function cron.unschedule(job_id bigint) returns boolean language plpgsql as
  $$ begin delete from cron.job where jobid = job_id; return true; end $$;

create schema if not exists net;
create table if not exists net.chamadas_simuladas (id bigserial primary key, url text, body jsonb, headers jsonb, criado timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint language plpgsql as
$$ declare i bigint; begin insert into net.chamadas_simuladas(url, body, headers) values (url, body, headers) returning id into i; return i; end $$;

create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create or replace view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language plpgsql as
$$ declare i uuid; begin insert into vault.secrets(secret, name, description) values (new_secret, new_name, new_description)
  on conflict (name) do update set secret = excluded.secret returning id into i; return i; end $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void language sql as
  $$ update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- As permissões das tabelas do schema public vêm do dump do esquema real (com ACLs),
-- para a base local negar o que a produção nega. Sem 'default privileges' permissivos aqui.
