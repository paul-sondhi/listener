-- Migration: Remove vault_test_tokens table
-- Created: 2024-12-19 09:59:19
-- Purpose: Clean up vault_test_tokens table which is no longer needed after Vault removal

-- Drop the vault_test_tokens table entirely
-- This was a test table for vault token storage functionality
DROP TABLE IF EXISTS "public"."vault_test_tokens";

-- Update schema version
INSERT INTO "public"."supabase_migrations" ("version", "checksum") 
VALUES ('20250619095919', 'remove_vault_test_tokens_v1') 
ON CONFLICT ("version") DO UPDATE SET 
    "applied_at" = timezone('utc'::text, now()),
    "checksum" = EXCLUDED."checksum"; 