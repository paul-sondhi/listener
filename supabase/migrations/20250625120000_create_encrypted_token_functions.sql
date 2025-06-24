-- migrate: disable_ddl_transaction

-- Purpose: Provide helper functions for storing and retrieving encrypted
-- Spotify OAuth tokens in the users table.
--
-- The implementation relies on the pgcrypto extension.  The surrounding CI
-- job creates the extension in the temp database; in production it already
-- exists by default on Supabase projects.

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Guard columns
-- ──────────────────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────────────────
-- 1. update_encrypted_tokens
--    Encrypts token JSON with pgp_sym_encrypt and stores it.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_encrypted_tokens(
  p_user_id uuid,
  p_token_data jsonb,
  p_encryption_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users
     SET spotify_tokens_enc = pgp_sym_encrypt(p_token_data::text, p_encryption_key),
         spotify_reauth_required = false,
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. get_encrypted_tokens
--    Decrypts and returns OAuth tokens for caller-side JSON parsing.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_encrypted_tokens(
  p_user_id uuid,
  p_encryption_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  decrypted jsonb;
BEGIN
  SELECT pgp_sym_decrypt(spotify_tokens_enc, p_encryption_key)::jsonb
    INTO decrypted
    FROM users
   WHERE id = p_user_id;

  IF decrypted IS NULL THEN
    RAISE EXCEPTION 'No encrypted tokens';
  END IF;
  RETURN decrypted;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. test_encryption helper
--    Round-trip assertion used by encryptedTokenHealthCheck().
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test_encryption(
  test_data text,
  encryption_key text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN pgp_sym_decrypt(pgp_sym_encrypt(test_data, encryption_key), encryption_key);
END;
$$; 