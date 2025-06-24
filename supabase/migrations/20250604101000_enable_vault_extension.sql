-- Migration: Enable Vault Extension and Setup Server Role
-- Phase 1: Vault & Pooling Setup
-- Created: 2025-01-07 00:00:01

-- Step 1.0: Ensure pgsodium (Vault dependency) is present
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Step 1.1: Enable vault extension
CREATE EXTENSION IF NOT EXISTS "supabase_vault";

-- Step 1.2: Create server role for enhanced security (simplified)
DO $$
BEGIN
    -- Create server role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vault_server') THEN
        CREATE ROLE vault_server;
    END IF;
END
$$;

-- Step 1.3: Grant basic permissions to server role
-- (Note: Complex vault permissions are handled by Supabase automatically)
GRANT USAGE ON SCHEMA vault TO vault_server;

-- Step 1.4: Add comments for documentation
COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault extension for secure secret storage';
COMMENT ON ROLE vault_server IS 'Server role with vault access permissions';

-- Step 1.5: Verification queries (commented out - for reference)
-- SELECT extname FROM pg_extension WHERE extname = 'supabase_vault';
-- SELECT rolname FROM pg_roles WHERE rolname = 'vault_server'; 