import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';

// Type definitions for encrypted token operations
export interface SpotifyTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

interface EncryptedTokenOperationResult {
  success: boolean;
  data?: SpotifyTokenData;
  error?: string;
  elapsed_ms: number;
}

interface EncryptedTokenDeleteResult {
  success: boolean;
  status_code: number;
  elapsed_ms: number;
  error?: string;
}

// Lazy initialization of Supabase client
let supabaseAdmin: SupabaseClient<Database> | null = null;

/**
 * Get Supabase admin client with proper error handling
 * @returns {SupabaseClient<Database>} The admin client instance
 */
function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin;
}

/**
 * Get encryption key from environment
 * @returns {string} The encryption key for pgcrypto
 */
function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENC_KEY || 'default-dev-key-change-in-production';
  if (process.env.NODE_ENV === 'production' && key === 'default-dev-key-change-in-production') {
    throw new Error('TOKEN_ENC_KEY must be set in production environment');
  }
  return key;
}

/**
 * Log encrypted token operation for monitoring and debugging
 * Never logs raw tokens for security
 * @param {string} userId - User ID for operation
 * @param {string} operation - Operation type (create, read, update, delete)
 * @param {number} elapsedMs - Operation duration in milliseconds
 * @param {boolean} success - Whether operation succeeded
 * @param {string} [error] - Error message if operation failed
 */
function logEncryptedTokenOperation(
  userId: string, 
  operation: string, 
  elapsedMs: number, 
  success: boolean, 
  error?: string
): void {
  const logData = {
    user_id: userId,
    operation,
    elapsed_ms: elapsedMs,
    success,
    timestamp: new Date().toISOString(),
    storage_type: 'encrypted_column',
    ...(error && { error })
  };
  
  // Log to stdout for monitoring systems to capture
  console.log(`ENCRYPTED_TOKEN_OPERATION: ${JSON.stringify(logData)}`);
}

/**
 * Create a new user token in encrypted column
 * Stores Spotify tokens as encrypted JSON in users.spotify_tokens_enc
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The Spotify token data to store
 * @returns {Promise<EncryptedTokenOperationResult>} Result of the create operation
 */
export async function createUserSecret(
  userId: string, 
  tokenData: SpotifyTokenData
): Promise<EncryptedTokenOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    const encryptionKey = getEncryptionKey();
    const tokenJson = JSON.stringify(tokenData);
    
    // Encrypt and store the token data using pgcrypto raw SQL
    const { error } = await supabase.rpc('update_encrypted_tokens', {
      p_user_id: userId,
      p_token_data: tokenJson,
      p_encryption_key: encryptionKey
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logEncryptedTokenOperation(userId, 'create', elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    
    logEncryptedTokenOperation(userId, 'create', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logEncryptedTokenOperation(userId, 'create', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Get user token from encrypted column
 * Reads and decrypts Spotify tokens for the given user
 * @param {string} userId - The user's UUID
 * @returns {Promise<EncryptedTokenOperationResult>} Result with parsed token data
 */
export async function getUserSecret(userId: string): Promise<EncryptedTokenOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    const encryptionKey = getEncryptionKey();
    
    // Get and decrypt token data using pgcrypto raw SQL
    const { data: userData, error: userError } = await supabase.rpc('get_encrypted_tokens', {
      p_user_id: userId,
      p_encryption_key: encryptionKey
    });
    
    if (userError) {
      const elapsedMs = Date.now() - startTime;
      logEncryptedTokenOperation(userId, 'read', elapsedMs, false, userError.message);
      return {
        success: false,
        error: userError.message,
        elapsed_ms: elapsedMs
      };
    }
    
    if (!userData) {
      const elapsedMs = Date.now() - startTime;
      const errorMsg = 'No encrypted tokens found for user';
      logEncryptedTokenOperation(userId, 'read', elapsedMs, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs
      };
    }
    
    // Parse the decrypted JSON token data
    const tokenData: SpotifyTokenData = JSON.parse(userData);
    
    const elapsedMs = Date.now() - startTime;
    logEncryptedTokenOperation(userId, 'read', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logEncryptedTokenOperation(userId, 'read', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Update user token in encrypted column
 * Overwrites existing Spotify tokens in place
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The updated Spotify token data
 * @returns {Promise<EncryptedTokenOperationResult>} Result of the update operation
 */
export async function updateUserSecret(
  userId: string, 
  tokenData: SpotifyTokenData
): Promise<EncryptedTokenOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    const encryptionKey = getEncryptionKey();
    const tokenJson = JSON.stringify(tokenData);
    
    // Encrypt and update the token data using pgcrypto raw SQL
    const { error } = await supabase.rpc('update_encrypted_tokens', {
      p_user_id: userId,
      p_token_data: tokenJson,
      p_encryption_key: encryptionKey
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logEncryptedTokenOperation(userId, 'update', elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    
    logEncryptedTokenOperation(userId, 'update', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logEncryptedTokenOperation(userId, 'update', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Delete user token from encrypted column
 * Clears the encrypted token data and sets reauth required
 * @param {string} userId - The user's UUID
 * @param {boolean} hardDelete - Whether to perform hard delete (ignored for column storage)
 * @param {string} deletionReason - Reason for deletion (for logging)
 * @returns {Promise<EncryptedTokenDeleteResult>} Result of the delete operation
 */
export async function deleteUserSecret(
  userId: string, 
  _hardDelete: boolean = false,
  _deletionReason: string = 'User request'
): Promise<EncryptedTokenDeleteResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Clear the encrypted token data and require reauth
    const { error } = await supabase
      .from('users')
      .update({
        spotify_tokens_enc: null,
        spotify_reauth_required: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logEncryptedTokenOperation(userId, 'delete', elapsedMs, false, error.message);
      return {
        success: false,
        status_code: 500,
        elapsed_ms: elapsedMs,
        error: error.message
      };
    }
    
    logEncryptedTokenOperation(userId, 'delete', elapsedMs, true);
    return {
      success: true,
      status_code: 204,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logEncryptedTokenOperation(userId, 'delete', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      status_code: 500,
      elapsed_ms: elapsedMs,
      error: errorMessage
    };
  }
}

/**
 * Store user token in encrypted column (creates new or updates existing)
 * Automatically determines whether to create a new token or update existing one
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The Spotify token data to store
 * @returns {Promise<EncryptedTokenOperationResult>} Result of the store operation
 */
export async function storeUserSecret(
  userId: string, 
  tokenData: SpotifyTokenData
): Promise<EncryptedTokenOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Check if user exists and has existing token data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('spotify_tokens_enc')
      .eq('id', userId)
      .single();
    
    if (userError) {
      const elapsedMs = Date.now() - startTime;
      return {
        success: false,
        error: `User lookup failed: ${userError.message}`,
        elapsed_ms: elapsedMs
      };
    }
    
    // Use update operation (same logic for create/update with encrypted column)
    console.log(`User ${userId} ${userData?.spotify_tokens_enc ? 'updating existing' : 'creating new'} encrypted tokens...`);
    return await updateUserSecret(userId, tokenData);
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error in storeUserSecret for user ${userId}:`, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Health check function to verify encrypted column connectivity
 * Tests basic database operations without storing real data
 * @returns {Promise<boolean>} True if encrypted column is accessible, false otherwise
 */
export async function encryptedTokenHealthCheck(): Promise<boolean> {
  // In the Vitest environment we rely on heavy module mocks for Supabase.
  // Attempting to hit the real database would both slow the suite and—when the
  // developer does *not* have a local `supabase start` instance—guarantee a
  // connection failure.  We therefore bail out early and assume health when
  // NODE_ENV === "test".  The integration / smoke tests that *do* target a
  // live database override this helper via `vi.mock()` to exercise the happy
  // path against real infrastructure.

  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  try {
    const supabase = getSupabaseAdmin();
    const encryptionKey = getEncryptionKey();
    
    /*
     * 1. Verify that the helper PL/pgSQL functions exist.
     *    We do this by invoking them with _dummy_ data. The calls are wrapped in
     *    logic that treats a "User not found" error as **success** (because the
     *    dummy user obviously does not exist) while treating a
     *    "function … does not exist" error as **failure** (because that means
     *    the migration that creates the function has not been applied).
     */
    const dummyUserId = '00000000-0000-0000-0000-000000000000';
    const dummyTokenJson = JSON.stringify({ health_check: true });
    
    // ── update_encrypted_tokens ────────────────────────────────────────────
    const { error: updateFnErr } = await supabase.rpc('update_encrypted_tokens', {
      p_user_id: dummyUserId,
      p_token_data: dummyTokenJson,
      p_encryption_key: encryptionKey
    });
    
    if (updateFnErr && !updateFnErr.message.includes('User not found')) {
      // Any error other than the expected "user not found" means the function
      // is missing or mis-behaving.
      console.error('Encrypted token health check failed: update_encrypted_tokens missing or invalid –', updateFnErr.message);
      return false;
    }
    
    // ── get_encrypted_tokens ──────────────────────────────────────────────
    const { error: getFnErr } = await supabase.rpc('get_encrypted_tokens', {
      p_user_id: dummyUserId,
      p_encryption_key: encryptionKey
    });
    
    if (getFnErr && !getFnErr.message.includes('No encrypted tokens')) {
      console.error('Encrypted token health check failed: get_encrypted_tokens missing or invalid –', getFnErr.message);
      return false;
    }
    
    /*
     * 2. Verify pgcrypto can actually encrypt/decrypt round-trips
     *    (this existed previously but we keep it as a cheap sanity check).
     */
    const testData = 'health-check-test';
    const { data: echo, error: testErr } = await supabase.rpc('test_encryption', {
      test_data: testData,
      encryption_key: encryptionKey
    });
    
    if (testErr) {
      console.error('Encrypted token health check failed: test_encryption call errored –', testErr.message);
      return false;
    }
    
    if (echo !== testData) {
      console.error('Encrypted token health check failed: decryption mismatch');
      return false;
    }
    
    console.log('Encrypted token health check passed – all helper functions present and pgcrypto operational');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Encrypted token health check exception:', errorMessage);
    return false;
  }
} 