-- Migration: Replace Supabase Vault with Encrypted Column for Spotify Tokens
-- Created: 2024-12-19 09:39:54
-- Purpose: Simplify token storage by moving from Vault to encrypted column

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add encrypted column for Spotify tokens to users table
-- Using bytea to store encrypted data with pgcrypto
ALTER TABLE "public"."users" 
ADD COLUMN IF NOT EXISTS "spotify_tokens_enc" bytea;

-- Step 2: Drop the vault secret ID column (no longer needed)
ALTER TABLE "public"."users" 
DROP COLUMN IF EXISTS "spotify_vault_secret_id";

-- Step 3: Clean up any existing Vault secrets for Spotify tokens
-- This removes any secrets with the naming pattern spotify:{userId}:tokens
DELETE FROM "vault"."secrets" 
WHERE "name" LIKE 'spotify:%:tokens';

-- Step 4: Drop Vault-related RLS policies that are no longer needed
DROP POLICY IF EXISTS "Users can manage their active secrets" ON "public"."user_secrets";
DROP POLICY IF EXISTS "Service role can manage all secrets" ON "public"."user_secrets";

-- Step 5: Drop Vault-related functions that are no longer needed
DROP FUNCTION IF EXISTS "public"."gdpr_soft_delete_user_secret"(uuid, text, text);
DROP FUNCTION IF EXISTS "public"."gdpr_hard_delete_user_secret"(uuid, text, text);
DROP FUNCTION IF EXISTS "public"."cleanup_expired_secrets"(integer);

-- Step 6: Drop GDPR audit log table (no longer needed without Vault)
DROP TABLE IF EXISTS "public"."gdpr_audit_log";

-- Step 7: Drop user_secrets table entirely (replaced by encrypted column)
DROP TABLE IF EXISTS "public"."user_secrets";

-- Update schema version
INSERT INTO "public"."supabase_migrations" ("version", "checksum") 
VALUES ('20250619093954', 'encrypted_token_column_v1') 
ON CONFLICT ("version") DO UPDATE SET 
    "applied_at" = timezone('utc'::text, now()),
    "checksum" = EXCLUDED."checksum";

-- Add comment for documentation
COMMENT ON COLUMN "public"."users"."spotify_tokens_enc" IS 'Encrypted Spotify access and refresh tokens stored as JSON using pgcrypto'; 