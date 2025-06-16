-- Migration: Add Vault Testing Functions
-- Phase 1.1: Add functions for testing vault functionality during CI/CD
-- Created: 2025-01-07 00:00:03

-- Step 1.1: Create test_vault_count function
-- This function returns the count of secrets in the vault for testing purposes
CREATE OR REPLACE FUNCTION public.test_vault_count()
RETURNS INTEGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  secret_count INTEGER;
BEGIN
  -- Count the number of secrets in the vault
  -- Using vault.secrets view if available, otherwise return 0
  BEGIN
    SELECT COUNT(*)::INTEGER 
    INTO secret_count
    FROM vault.secrets;
    
    RETURN COALESCE(secret_count, 0);
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault.secrets is not accessible or doesn't exist, return 0
      RETURN 0;
  END;
END;
$$;

-- Step 1.2: Create test_vault_insert function for testing secret creation
-- This function allows testing secret insertion during validation
CREATE OR REPLACE FUNCTION public.test_vault_insert(
  secret_name TEXT,
  secret_data TEXT
)
RETURNS UUID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  secret_id UUID;
BEGIN
  -- Insert a test secret into the vault
  BEGIN
    SELECT vault.create_secret(secret_data, secret_name)
    INTO secret_id;
    
    RETURN secret_id;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error
      RAISE EXCEPTION 'Failed to create test secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.3: Create test_vault_read function for testing secret retrieval
-- This function allows testing secret reading during validation
CREATE OR REPLACE FUNCTION public.test_vault_read(
  secret_id UUID
)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  -- Read a test secret from the vault
  BEGIN
    SELECT decrypted_secret
    INTO secret_value
    FROM vault.decrypted_secrets
    WHERE id = secret_id;
    
    RETURN secret_value;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error
      RAISE EXCEPTION 'Failed to read test secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.4: Create test_vault_delete function for cleanup
-- This function allows cleaning up test secrets after validation
CREATE OR REPLACE FUNCTION public.test_vault_delete(
  secret_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete a test secret from the vault
  BEGIN
    DELETE FROM vault.secrets WHERE id = secret_id;
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      -- If deletion fails, return false but don't error
      RETURN FALSE;
  END;
END;
$$;

-- Step 1.5: Grant execute permissions to authenticated users
-- This allows the service role to call these functions during testing
GRANT EXECUTE ON FUNCTION public.test_vault_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_vault_insert(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_vault_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_vault_delete(UUID) TO authenticated;

-- Step 1.6: Grant execute permissions to service role specifically
-- This ensures the service role used in CI can call these functions
GRANT EXECUTE ON FUNCTION public.test_vault_count() TO service_role;
GRANT EXECUTE ON FUNCTION public.test_vault_insert(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.test_vault_read(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.test_vault_delete(UUID) TO service_role;

-- Step 1.7: Add comments for documentation
COMMENT ON FUNCTION public.test_vault_count() IS 'Returns count of secrets in vault for testing';
COMMENT ON FUNCTION public.test_vault_insert(TEXT, TEXT) IS 'Inserts test secret into vault for validation';
COMMENT ON FUNCTION public.test_vault_read(UUID) IS 'Reads test secret from vault for validation';
COMMENT ON FUNCTION public.test_vault_delete(UUID) IS 'Deletes test secret from vault for cleanup'; 