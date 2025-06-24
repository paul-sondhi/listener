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

-- 2️⃣  Stub out the auth schema and users table so that FK constraints
--     in remote_schema.sql are satisfied. These are *minimal* stubs –
--     we only declare the primary key the FK points to.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  provider text,
  identity_data jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT identities_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

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

-- 4️⃣  Stub auth.uid() so RLS policies in remote_schema.sql compile.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$; 