-- Migration to add PostgreSQL advisory lock RPC functions
-- These are wrapper functions around PostgreSQL's built-in advisory lock functions
-- to make them accessible via Supabase's RPC interface

-- Function to try acquiring an advisory lock
-- Returns true if lock was acquired, false if already held by another session
CREATE OR REPLACE FUNCTION pg_try_advisory_lock(key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_try_advisory_lock(hashtext(key));
$$;

-- Function to release an advisory lock
-- Returns true if lock was released, false if lock was not held by this session
CREATE OR REPLACE FUNCTION pg_advisory_unlock(key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_advisory_unlock(hashtext(key));
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION pg_try_advisory_lock(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_advisory_unlock(text) TO authenticated; 