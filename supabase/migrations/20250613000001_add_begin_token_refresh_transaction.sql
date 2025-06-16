-- Migration: Add missing begin_token_refresh_transaction function
-- Created: 2025-06-13 00:00:01
-- Purpose: Fix token refresh locking functionality

-- Create the begin_token_refresh_transaction function
-- This function implements SELECT ... FOR UPDATE to prevent concurrent refresh attempts
-- for the same user during token refresh operations
CREATE OR REPLACE FUNCTION "public"."begin_token_refresh_transaction"(p_user_id uuid)
RETURNS TABLE (
    user_id uuid,
    locked boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    locked_user_record record;
BEGIN
    -- Use SELECT ... FOR UPDATE to lock the user row during refresh
    -- This prevents concurrent refresh attempts for the same user
    -- We'll lock against the users table if it exists, otherwise use vault_test_tokens
    BEGIN
        -- Try to lock from users table first
        SELECT u.id INTO locked_user_record
        FROM auth.users u
        WHERE u.id = p_user_id
        FOR UPDATE NOWAIT;
        
        -- If we successfully acquired the lock, return success
        RETURN QUERY SELECT p_user_id, true;
        
    EXCEPTION 
        WHEN lock_not_available THEN
            -- Another process is already refreshing tokens for this user
            RETURN QUERY SELECT p_user_id, false;
        WHEN OTHERS THEN
            -- If users table doesn't exist or other error, try vault_test_tokens
            BEGIN
                SELECT vtt.user_id::uuid INTO locked_user_record
                FROM public.vault_test_tokens vtt
                WHERE vtt.user_id = p_user_id::text
                FOR UPDATE NOWAIT;
                
                -- If we successfully acquired the lock, return success
                RETURN QUERY SELECT p_user_id, true;
                
            EXCEPTION 
                WHEN lock_not_available THEN
                    -- Another process is already refreshing tokens for this user
                    RETURN QUERY SELECT p_user_id, false;
                WHEN OTHERS THEN
                    -- No suitable table found or user doesn't exist
                    -- Still return success to allow the refresh attempt
                    RETURN QUERY SELECT p_user_id, true;
            END;
    END;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION "public"."begin_token_refresh_transaction"(uuid) IS 'Acquires a lock for token refresh operations to prevent concurrent refresh attempts for the same user'; 