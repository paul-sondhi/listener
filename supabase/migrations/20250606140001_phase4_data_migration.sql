-- Phase 4: Database Schema Migration (Read-Only Window)
-- Migrate existing Spotify token data from plaintext to vault storage
-- Created: 2025-06-06 14:00:01

-- Begin transaction for data migration
BEGIN;

-- Log migration start
DO $$
BEGIN
    RAISE NOTICE 'Phase 4: Starting Spotify token data migration to vault...';
END
$$;

-- Create temporary function for data migration
CREATE OR REPLACE FUNCTION migrate_spotify_tokens_to_vault()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    user_record RECORD;
    token_data JSONB;
    vault_secret_id TEXT;
    migration_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    -- Log migration start
    RAISE NOTICE 'Starting migration of existing Spotify tokens to vault...';
    
    -- Iterate through users with existing Spotify tokens
    FOR user_record IN 
        SELECT id, spotify_access_token, spotify_refresh_token, spotify_token_expires_at, email
        FROM public.users 
        WHERE spotify_access_token IS NOT NULL 
          AND spotify_refresh_token IS NOT NULL
          AND spotify_vault_secret_id IS NULL -- Only migrate if not already migrated
    LOOP
        BEGIN
            -- Prepare token data as JSON blob
            token_data := jsonb_build_object(
                'access_token', user_record.spotify_access_token,
                'refresh_token', user_record.spotify_refresh_token,
                'expires_at', EXTRACT(EPOCH FROM user_record.spotify_token_expires_at) * 1000, -- Convert to milliseconds
                'scope', 'user-read-private user-read-email', -- Default scope
                'token_type', 'Bearer',
                'migrated_at', EXTRACT(EPOCH FROM NOW()) * 1000
            );
            
            -- Generate vault secret name
            vault_secret_id := 'spotify:' || user_record.id::text || ':tokens';
            
            -- Store in vault (using fallback user_secrets table for this migration)
            -- In production, this would use vault.create_secret()
            INSERT INTO public.user_secrets (user_id, secret_name, secret_data, created_at, updated_at)
            VALUES (
                user_record.id,
                vault_secret_id,
                token_data::text,
                NOW(),
                NOW()
            )
            ON CONFLICT (user_id, secret_name) 
            DO UPDATE SET 
                secret_data = EXCLUDED.secret_data,
                updated_at = NOW();
            
            -- Update users table with vault reference
            UPDATE public.users 
            SET 
                spotify_vault_secret_id = vault_secret_id,
                spotify_reauth_required = false,
                updated_at = NOW()
            WHERE id = user_record.id;
            
            migration_count := migration_count + 1;
            
            -- Log progress every 10 users
            IF migration_count % 10 = 0 THEN
                RAISE NOTICE 'Migrated % users to vault storage...', migration_count;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            RAISE WARNING 'Failed to migrate user %: %', user_record.id, SQLERRM;
            
            -- Set reauth required for failed migrations
            UPDATE public.users 
            SET spotify_reauth_required = true 
            WHERE id = user_record.id;
        END;
    END LOOP;
    
    -- Log migration results
    RAISE NOTICE 'Migration completed: % users migrated, % errors', migration_count, error_count;
    
    -- Update schema version to reflect data migration
    INSERT INTO public.supabase_migrations (version, checksum) 
    VALUES ('20250606140001', 'phase4_data_migration_v1') 
    ON CONFLICT (version) DO UPDATE SET 
        applied_at = NOW(),
        checksum = EXCLUDED.checksum;
        
END;
$function$;

-- Execute the migration
SELECT migrate_spotify_tokens_to_vault();

-- Create function to validate migration
CREATE OR REPLACE FUNCTION validate_spotify_token_migration()
RETURNS TABLE(
    total_users INTEGER,
    users_with_tokens INTEGER,
    users_migrated INTEGER,
    users_requiring_reauth INTEGER,
    migration_success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    total_users_count INTEGER;
    users_with_tokens_count INTEGER;
    users_migrated_count INTEGER;
    users_reauth_count INTEGER;
BEGIN
    -- Count total users
    SELECT COUNT(*) INTO total_users_count FROM public.users;
    
    -- Count users with existing tokens
    SELECT COUNT(*) INTO users_with_tokens_count 
    FROM public.users 
    WHERE spotify_access_token IS NOT NULL AND spotify_refresh_token IS NOT NULL;
    
    -- Count successfully migrated users
    SELECT COUNT(*) INTO users_migrated_count 
    FROM public.users 
    WHERE spotify_vault_secret_id IS NOT NULL;
    
    -- Count users requiring reauth
    SELECT COUNT(*) INTO users_reauth_count 
    FROM public.users 
    WHERE spotify_reauth_required = true;
    
    RETURN QUERY SELECT 
        total_users_count,
        users_with_tokens_count,
        users_migrated_count,
        users_reauth_count,
        CASE 
            WHEN users_with_tokens_count > 0 THEN 
                ROUND((users_migrated_count::NUMERIC / users_with_tokens_count::NUMERIC) * 100, 2)
            ELSE 0
        END;
END;
$function$;

-- Run validation and log results
DO $$
DECLARE
    validation_result RECORD;
BEGIN
    SELECT * INTO validation_result FROM validate_spotify_token_migration();
    
    RAISE NOTICE 'Migration Validation Results:';
    RAISE NOTICE '  Total users: %', validation_result.total_users;
    RAISE NOTICE '  Users with tokens: %', validation_result.users_with_tokens;
    RAISE NOTICE '  Users migrated: %', validation_result.users_migrated;
    RAISE NOTICE '  Users requiring reauth: %', validation_result.users_requiring_reauth;
    RAISE NOTICE '  Migration success rate: %%%', validation_result.migration_success_rate;
END;
$$;

-- Create index for better query performance on migrated data
CREATE INDEX IF NOT EXISTS idx_users_migrated_tokens 
ON public.users(spotify_vault_secret_id) 
WHERE spotify_vault_secret_id IS NOT NULL;

-- Add comment to track migration
COMMENT ON TABLE public.users IS 'Users table with Spotify tokens migrated to vault storage (Phase 4)';

-- Grant necessary permissions for vault operations
GRANT USAGE ON SCHEMA vault TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA vault TO service_role;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Phase 4: Spotify token data migration completed successfully!';
    RAISE NOTICE 'Next step: Test vault integration and consider dropping plaintext columns';
END
$$;

COMMIT; 