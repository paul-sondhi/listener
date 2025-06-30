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