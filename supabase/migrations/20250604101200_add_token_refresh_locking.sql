-- Migration: Add Token Refresh Locking and Vault Schema Updates
-- Phase 2: Lightweight Token Storage + Simple Cache + Schema Migration
-- Created: 2025-01-07 00:00:02

-- Step 2.1: Create a simple test table for vault storage (if users table doesn't exist)
-- This will allow us to test vault functionality
CREATE TABLE IF NOT EXISTS "public"."vault_test_tokens" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" text NOT NULL,
    "token_type" text NOT NULL DEFAULT 'spotify_token',
    "vault_secret_id" uuid,
    "refresh_required" boolean DEFAULT false,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- Step 2.2: Add index for efficient vault operations
CREATE INDEX IF NOT EXISTS "idx_vault_test_tokens_vault_secret_id"
ON "public"."vault_test_tokens" USING btree ("vault_secret_id");

-- Step 2.3: Add index on refresh_required for efficient queries
CREATE INDEX IF NOT EXISTS "idx_vault_test_tokens_refresh_required"
ON "public"."vault_test_tokens" USING btree ("refresh_required")
WHERE "refresh_required" = true;

-- Step 2.4: Add comments for documentation
COMMENT ON TABLE "public"."vault_test_tokens" IS 'Test table for vault token storage functionality';
COMMENT ON COLUMN "public"."vault_test_tokens"."vault_secret_id" IS 'References secret stored in vault.secrets';
COMMENT ON COLUMN "public"."vault_test_tokens"."refresh_required" IS 'Indicates if token needs refresh (for testing reauth flows)';

-- Step 2.5: Create example function for vault operations (testing)
CREATE OR REPLACE FUNCTION "public"."test_vault_operations"()
RETURNS TABLE (
    test_name text,
    success boolean,
    message text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    test_secret_id uuid;
    retrieved_value text;
BEGIN
    -- Test 1: Insert a test secret
    BEGIN
        INSERT INTO vault.secrets (name, secret) 
        VALUES ('test_token_123', 'test-secret-value-456')
        RETURNING id INTO test_secret_id;
        
        RETURN QUERY SELECT 'Insert Secret'::text, true, 'Successfully inserted test secret'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Insert Secret'::text, false, SQLERRM::text;
        RETURN;
    END;
    
    -- Test 2: Retrieve the test secret
    BEGIN
        SELECT decrypted_secret INTO retrieved_value
        FROM vault.decrypted_secrets 
        WHERE name = 'test_token_123';
        
        IF retrieved_value = 'test-secret-value-456' THEN
            RETURN QUERY SELECT 'Retrieve Secret'::text, true, 'Successfully retrieved and decrypted secret'::text;
        ELSE
            RETURN QUERY SELECT 'Retrieve Secret'::text, false, 'Secret value mismatch'::text;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Retrieve Secret'::text, false, SQLERRM::text;
        RETURN;
    END;
    
    -- Test 3: Clean up test secret
    BEGIN
        DELETE FROM vault.secrets WHERE name = 'test_token_123';
        RETURN QUERY SELECT 'Cleanup Secret'::text, true, 'Successfully cleaned up test secret'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Cleanup Secret'::text, false, SQLERRM::text;
    END;
END;
$$;

-- Step 2.6: Add comment for test function
COMMENT ON FUNCTION "public"."test_vault_operations"() IS 'Test function to verify vault operations work correctly'; 