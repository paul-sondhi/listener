-- Migration: Fix Vault Update Function
-- Phase 1.3: Fix vault update function to use proper vault extension methods
-- Created: 2025-01-07 00:00:05

-- Step 1.1: Update the vault_update_user_secret function to use vault.update_secret
-- The previous version tried to update vault.secrets directly which requires higher permissions
CREATE OR REPLACE FUNCTION public.vault_update_user_secret(
  p_secret_id UUID,
  p_secret_data TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update secret using vault extension's update function if available
  -- If not available, we'll delete and recreate (common pattern for vault updates)
  BEGIN
    -- Try vault.update_secret if it exists
    BEGIN
      PERFORM vault.update_secret(p_secret_id, p_secret_data);
      RETURN TRUE;
    EXCEPTION
      WHEN undefined_function THEN
        -- Vault extension doesn't have update_secret, so delete and recreate
        -- First get the secret name and description
        DECLARE
          secret_name TEXT;
          secret_desc TEXT;
        BEGIN
          SELECT name, description 
          INTO secret_name, secret_desc
          FROM vault.secrets 
          WHERE id = p_secret_id;
          
          IF secret_name IS NULL THEN
            RAISE EXCEPTION 'Secret not found: %', p_secret_id;
          END IF;
          
          -- Delete the old secret
          DELETE FROM vault.secrets WHERE id = p_secret_id;
          
          -- Create new secret with same name but updated data
          PERFORM vault.create_secret(p_secret_data, secret_name, secret_desc);
          
          RETURN TRUE;
        END;
    END;
  EXCEPTION
    WHEN OTHERS THEN
      -- If vault operations fail, raise an error with context
      RAISE EXCEPTION 'Failed to update vault secret: %', SQLERRM;
  END;
END;
$$;

-- Step 1.2: Add comment for documentation
COMMENT ON FUNCTION public.vault_update_user_secret(UUID, TEXT) IS 'Updates an existing secret in vault by ID (uses delete/recreate if update not available)'; 