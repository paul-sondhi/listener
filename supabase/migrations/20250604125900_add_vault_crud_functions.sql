-- Migration: Add Vault CRUD Functions for Production Use
-- Phase 1.2: Add secure functions for vault operations that bypass REST API limitations
-- Created: 2025-01-07 00:00:04

-- Step 1.1: Create vault_create_user_secret function
-- This function creates a secret for a user's Spotify tokens
CREATE OR REPLACE FUNCTION public.vault_create_user_secret(
  p_secret_name TEXT,
  p_secret_data TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  secret_id UUID;
BEGIN
  -- Create secret using vault extension's built-in function
  BEGIN
    SELECT vault.create_secret(p_secret_data, p_secret_name, p_description)
    INTO secret_id;
    
    RETURN secret_id;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error with context
      RAISE EXCEPTION 'Failed to create vault secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.2: Create vault_read_user_secret function  
-- This function reads a secret by ID and returns the decrypted data
CREATE OR REPLACE FUNCTION public.vault_read_user_secret(
  p_secret_id UUID
)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  -- Read secret using vault's decrypted_secrets view
  BEGIN
    SELECT decrypted_secret
    INTO secret_value
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;
    
    IF secret_value IS NULL THEN
      RAISE EXCEPTION 'Secret not found or inaccessible: %', p_secret_id;
    END IF;
    
    RETURN secret_value;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error with context
      RAISE EXCEPTION 'Failed to read vault secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.3: Create vault_update_user_secret function
-- This function updates an existing secret by ID
CREATE OR REPLACE FUNCTION public.vault_update_user_secret(
  p_secret_id UUID,
  p_secret_data TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update secret using direct vault access (only possible in SECURITY DEFINER)
  BEGIN
    UPDATE vault.secrets 
    SET 
      secret = p_secret_data,
      updated_at = NOW()
    WHERE id = p_secret_id;
    
    -- Check if any rows were updated
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Secret not found or inaccessible: %', p_secret_id;
    END IF;
    
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error with context
      RAISE EXCEPTION 'Failed to update vault secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.4: Create vault_delete_user_secret function
-- This function deletes a secret by ID
CREATE OR REPLACE FUNCTION public.vault_delete_user_secret(
  p_secret_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete secret using direct vault access (only possible in SECURITY DEFINER)
  BEGIN
    DELETE FROM vault.secrets WHERE id = p_secret_id;
    
    -- Check if any rows were deleted
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Secret not found or inaccessible: %', p_secret_id;
    END IF;
    
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error with context
      RAISE EXCEPTION 'Failed to delete vault secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.5: Grant execute permissions to service role
-- This ensures the service role can call these functions
GRANT EXECUTE ON FUNCTION public.vault_create_user_secret(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_read_user_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_user_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_user_secret(UUID) TO service_role;

-- Step 1.6: Grant execute permissions to authenticated users (for web app usage)
GRANT EXECUTE ON FUNCTION public.vault_create_user_secret(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_read_user_secret(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_user_secret(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_delete_user_secret(UUID) TO authenticated;

-- Step 1.7: Add comments for documentation
COMMENT ON FUNCTION public.vault_create_user_secret(TEXT, TEXT, TEXT) IS 'Creates a new secret in vault for user data';
COMMENT ON FUNCTION public.vault_read_user_secret(UUID) IS 'Reads and decrypts a secret from vault by ID';
COMMENT ON FUNCTION public.vault_update_user_secret(UUID, TEXT) IS 'Updates an existing secret in vault by ID';
COMMENT ON FUNCTION public.vault_delete_user_secret(UUID) IS 'Deletes a secret from vault by ID'; 