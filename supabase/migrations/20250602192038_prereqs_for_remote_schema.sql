-- Pre-requisites for 20250602192039_remote_schema.sql
-- ----------------------------------------------------
-- This script must run BEFORE remote_schema.sql because that file
-- references the uuid_generate_v4() function (provided by the
-- uuid-ossp extension) and foreign-keys to the auth.users table.
--
-- We only create the minimal objects needed for the remote schema to
-- load; the real Supabase platform will later replace/extend these.

-- 1️⃣  Make sure uuid_generate_v4() exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Local Supabase already ships the auth schema, users table, and helper functions; stubs removed to avoid 42501 permission errors.

-- 2️⃣  Ensure `auth` schema and minimal tables exist in plain-Postgres (CI/prod).
--     Silently skip creation when we lack privileges (local Supabase).

DO $$
BEGIN
  -- Create schema when missing
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'CREATE SCHEMA auth';
  END IF;

  -- Create auth.users when missing
  IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'auth' AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TABLE auth.users (id uuid PRIMARY KEY)';
  END IF;

  -- Create auth.identities when missing
  IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'auth' AND c.relname = 'identities'
  ) THEN
    EXECUTE 'CREATE TABLE auth.identities (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL,
      provider text,
      identity_data jsonb,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT identities_user_fk
        FOREIGN KEY (user_id) REFERENCES auth.users(id)
    )';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    -- Running inside local Supabase → ignore
    NULL;
END $$;

-- 2️⃣a  Stub auth.uid() only when absent and we have rights
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid; $$ LANGUAGE sql STABLE';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END $$;

-- 3️⃣  Create Supabase roles expected by remote_schema.sql
DO $$
BEGIN
  -- role: anon
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  -- role: authenticated
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  -- role: service_role
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;