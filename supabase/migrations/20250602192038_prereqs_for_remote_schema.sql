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