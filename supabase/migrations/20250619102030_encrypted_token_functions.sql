-- Migration: Add encrypted token helper functions
-- Created: 2025-06-19 10:20:30

-- Function to update encrypted tokens for a user
CREATE OR REPLACE FUNCTION update_encrypted_tokens(
  p_user_id UUID,
  p_token_data TEXT,
  p_encryption_key TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user's encrypted token data
  UPDATE users 
  SET 
    spotify_tokens_enc = pgp_sym_encrypt(p_token_data, p_encryption_key),
    spotify_reauth_required = false,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Raise exception if user not found
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$;

-- Function to get and decrypt encrypted tokens for a user
CREATE OR REPLACE FUNCTION get_encrypted_tokens(
  p_user_id UUID,
  p_encryption_key TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encrypted_data BYTEA;
  decrypted_data TEXT;
BEGIN
  -- Get encrypted token data
  SELECT spotify_tokens_enc INTO encrypted_data
  FROM users 
  WHERE id = p_user_id;
  
  -- Return null if user not found or no tokens
  IF NOT FOUND OR encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt the token data
  SELECT pgp_sym_decrypt(encrypted_data, p_encryption_key) INTO decrypted_data;
  
  RETURN decrypted_data;
END;
$$;

-- Function to test encryption/decryption functionality
CREATE OR REPLACE FUNCTION test_encryption(
  test_data TEXT,
  encryption_key TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encrypted_data BYTEA;
  decrypted_data TEXT;
BEGIN
  -- Encrypt the test data
  SELECT pgp_sym_encrypt(test_data, encryption_key) INTO encrypted_data;
  
  -- Decrypt it back
  SELECT pgp_sym_decrypt(encrypted_data, encryption_key) INTO decrypted_data;
  
  RETURN decrypted_data;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_encrypted_tokens(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_tokens(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_encryption(TEXT, TEXT) TO authenticated;

-- Grant execute permissions to service role (for server-side operations)
GRANT EXECUTE ON FUNCTION update_encrypted_tokens(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_encrypted_tokens(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_encryption(TEXT, TEXT) TO service_role; 