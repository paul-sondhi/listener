-- Migration: Drop legacy Spotify token columns from users table
-- These columns have been migrated to the vault system as of 20250606140001
-- Created: 2025-01-08 00:00:01

-- Begin transaction for schema changes
BEGIN;

-- Log migration start
DO $$
BEGIN
    RAISE NOTICE 'Starting migration to drop legacy Spotify token columns...';
END
$$;

-- Verify that data migration has completed before dropping columns
-- Check that users with existing tokens have been migrated to vault
DO $$
DECLARE
    users_with_tokens INTEGER := 0;
    users_migrated INTEGER := 0;
    migration_ready BOOLEAN := false;
    spotify_access_token_exists BOOLEAN := false;
    spotify_refresh_token_exists BOOLEAN := false;
    spotify_vault_secret_id_exists BOOLEAN := false;
BEGIN
    -- Check if columns exist before querying them
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_access_token'
        AND table_schema = 'public'
    ) INTO spotify_access_token_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_refresh_token'
        AND table_schema = 'public'
    ) INTO spotify_refresh_token_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_vault_secret_id'
        AND table_schema = 'public'
    ) INTO spotify_vault_secret_id_exists;
    
    -- Only count users with tokens if the columns exist
    IF spotify_access_token_exists AND spotify_refresh_token_exists THEN
        SELECT COUNT(*) INTO users_with_tokens 
        FROM public.users 
        WHERE spotify_access_token IS NOT NULL 
          AND spotify_refresh_token IS NOT NULL;
    END IF;
    
    -- Only count migrated users if the vault column exists
    IF spotify_vault_secret_id_exists THEN
        SELECT COUNT(*) INTO users_migrated 
        FROM public.users 
        WHERE spotify_vault_secret_id IS NOT NULL;
    END IF;
    
    -- Check if migration is safe to proceed
    IF users_with_tokens = 0 OR users_migrated >= users_with_tokens THEN
        migration_ready := true;
        RAISE NOTICE 'Migration verification passed:';
        RAISE NOTICE '  Users with plaintext tokens: %', users_with_tokens;
        RAISE NOTICE '  Users with vault migration: %', users_migrated;
        RAISE NOTICE '  spotify_access_token exists: %', spotify_access_token_exists;
        RAISE NOTICE '  spotify_refresh_token exists: %', spotify_refresh_token_exists;
        RAISE NOTICE '  spotify_vault_secret_id exists: %', spotify_vault_secret_id_exists;
    ELSE
        RAISE EXCEPTION 'Migration verification failed: % users have plaintext tokens but only % are migrated to vault', 
            users_with_tokens, users_migrated;
    END IF;
    
    IF NOT migration_ready THEN
        RAISE EXCEPTION 'Cannot proceed with column drop - data migration incomplete';
    END IF;
END
$$;

-- Create backup function to validate post-migration state
CREATE OR REPLACE FUNCTION validate_token_migration_completion()
RETURNS TABLE(
    columns_exist BOOLEAN,
    vault_users_count INTEGER,
    validation_passed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    spotify_access_token_exists BOOLEAN := false;
    spotify_refresh_token_exists BOOLEAN := false;
    spotify_token_expires_at_exists BOOLEAN := false;
    vault_users_count_var INTEGER := 0;
    spotify_vault_secret_id_exists BOOLEAN := false;
BEGIN
    -- Check if old columns still exist (they shouldn't after this migration)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_access_token'
        AND table_schema = 'public'
    ) INTO spotify_access_token_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_refresh_token'
        AND table_schema = 'public'
    ) INTO spotify_refresh_token_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_token_expires_at'
        AND table_schema = 'public'
    ) INTO spotify_token_expires_at_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'spotify_vault_secret_id'
        AND table_schema = 'public'
    ) INTO spotify_vault_secret_id_exists;
    
    -- Count users with vault secrets only if the column exists
    IF spotify_vault_secret_id_exists THEN
        SELECT COUNT(*) INTO vault_users_count_var
        FROM public.users 
        WHERE spotify_vault_secret_id IS NOT NULL;
    END IF;
    
    RETURN QUERY SELECT 
        (spotify_access_token_exists OR spotify_refresh_token_exists OR spotify_token_expires_at_exists),
        vault_users_count_var,
        NOT (spotify_access_token_exists OR spotify_refresh_token_exists OR spotify_token_expires_at_exists);
END;
$function$;

-- Drop the legacy columns from users table
-- These are safe to drop because:
-- 1. Data has been migrated to vault system (migration 20250606140001)
-- 2. Application code now uses vault helpers instead of these columns
-- 3. All routes (spotifyTokens.ts, syncShows.ts) have been updated
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "spotify_access_token";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "spotify_refresh_token";  
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "spotify_token_expires_at";

-- Validate the migration
DO $$
DECLARE
    validation_result RECORD;
BEGIN
    SELECT * INTO validation_result FROM validate_token_migration_completion();
    
    RAISE NOTICE 'Post-migration validation:';
    RAISE NOTICE '  Legacy columns still exist: %', validation_result.columns_exist;
    RAISE NOTICE '  Users with vault secrets: %', validation_result.vault_users_count;
    RAISE NOTICE '  Validation passed: %', validation_result.validation_passed;
    
    IF NOT validation_result.validation_passed THEN
        RAISE EXCEPTION 'Post-migration validation failed - legacy columns still exist';
    END IF;
END;
$$;

-- Update schema version tracking
INSERT INTO "public"."supabase_migrations" ("version", "checksum") 
VALUES ('20250607000001', 'drop_spotify_token_columns_v2') 
ON CONFLICT ("version") DO UPDATE SET 
    "applied_at" = timezone('utc'::text, now()),
    "checksum" = EXCLUDED."checksum";

-- Add comment to track the cleanup
COMMENT ON TABLE public.users IS 'Users table with Spotify tokens migrated to vault storage (legacy columns dropped in 20250607000001)';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Successfully dropped legacy Spotify token columns from users table!';
    RAISE NOTICE 'All Spotify tokens are now exclusively stored in vault system.';
END
$$;

COMMIT; 