import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';

// Type definitions for vault operations
export interface SpotifyTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

interface VaultOperationResult {
  success: boolean;
  data?: SpotifyTokenData;
  error?: string;
  elapsed_ms: number;
}

interface VaultDeleteResult {
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
 * Generate vault secret name for user's Spotify tokens
 * Format: spotify:{userId}:tokens
 * @param {string} userId - The user's UUID
 * @returns {string} The formatted secret name
 */
function getSpotifySecretName(userId: string): string {
  return `spotify:${userId}:tokens`;
}

/**
 * Log vault operation for monitoring and debugging
 * Never logs raw tokens or vault IDs for security
 * @param {string} userId - User ID for operation
 * @param {string} operation - Operation type (create, read, update, delete)
 * @param {number} elapsedMs - Operation duration in milliseconds
 * @param {boolean} success - Whether operation succeeded
 * @param {string} [error] - Error message if operation failed
 */
function logVaultOperation(
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
    ...(error && { error })
  };
  
  // Log to stdout for monitoring systems to capture
  console.log(`VAULT_OPERATION: ${JSON.stringify(logData)}`);
}

/**
 * Create a new user secret in Vault
 * Stores Spotify tokens as JSON in format: spotify:{userId}:tokens
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The Spotify token data to store
 * @returns {Promise<VaultOperationResult>} Result of the create operation
 */
export async function createUserSecret(
  userId: string, 
  tokenData: SpotifyTokenData
): Promise<VaultOperationResult> {
  const startTime = Date.now();
  const secretName = getSpotifySecretName(userId);
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Store the secret in vault.secrets table
    // The vault extension handles encryption automatically
    const { data, error } = await supabase
      .from('vault.secrets')
      .insert({
        name: secretName,
        secret: JSON.stringify(tokenData),
        description: `Spotify tokens for user ${userId}`,
        key_id: 'default' // Use default vault key
      })
      .select()
      .single();
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logVaultOperation(userId, 'create', elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    
    // Update user record with vault secret ID
    const { error: updateError } = await supabase
      .from('users')
      .update({
        spotify_vault_secret_id: data.id,
        spotify_reauth_required: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      logVaultOperation(userId, 'create', elapsedMs, false, `User update failed: ${updateError.message}`);
      return {
        success: false,
        error: `User update failed: ${updateError.message}`,
        elapsed_ms: elapsedMs
      };
    }
    
    logVaultOperation(userId, 'create', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logVaultOperation(userId, 'create', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Get user secret from Vault
 * Reads and parses Spotify tokens for the given user
 * @param {string} userId - The user's UUID
 * @returns {Promise<VaultOperationResult>} Result with parsed token data
 */
export async function getUserSecret(userId: string): Promise<VaultOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    
    // First get the vault secret ID from the user record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('spotify_vault_secret_id')
      .eq('id', userId)
      .single();
    
    if (userError || !userData?.spotify_vault_secret_id) {
      const elapsedMs = Date.now() - startTime;
      const errorMsg = userError?.message || 'No vault secret ID found for user';
      logVaultOperation(userId, 'read', elapsedMs, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs
      };
    }
    
    // Retrieve the secret from vault using the ID
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('id', userData.spotify_vault_secret_id)
      .single();
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logVaultOperation(userId, 'read', elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    
    // Parse the JSON token data
    const tokenData: SpotifyTokenData = JSON.parse(data.decrypted_secret);
    
    logVaultOperation(userId, 'read', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logVaultOperation(userId, 'read', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Update user secret in Vault
 * Overwrites existing Spotify tokens in place
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The updated Spotify token data
 * @returns {Promise<VaultOperationResult>} Result of the update operation
 */
export async function updateUserSecret(
  userId: string, 
  tokenData: SpotifyTokenData
): Promise<VaultOperationResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Get the vault secret ID from the user record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('spotify_vault_secret_id')
      .eq('id', userId)
      .single();
    
    if (userError || !userData?.spotify_vault_secret_id) {
      const elapsedMs = Date.now() - startTime;
      const errorMsg = userError?.message || 'No vault secret ID found for user';
      logVaultOperation(userId, 'update', elapsedMs, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs
      };
    }
    
    // Update the secret in vault
    const { error } = await supabase
      .from('vault.secrets')
      .update({
        secret: JSON.stringify(tokenData),
        updated_at: new Date().toISOString()
      })
      .eq('id', userData.spotify_vault_secret_id);
    
    const elapsedMs = Date.now() - startTime;
    
    if (error) {
      logVaultOperation(userId, 'update', elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    
    logVaultOperation(userId, 'update', elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logVaultOperation(userId, 'update', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}

/**
 * Delete user secret from Vault
 * Supports both soft delete (GDPR compliance) and hard delete
 * @param {string} userId - The user's UUID
 * @param {boolean} hardDelete - Whether to perform hard delete (default: false for soft delete)
 * @param {string} deletionReason - Reason for deletion (for GDPR compliance)
 * @returns {Promise<VaultDeleteResult>} Result of the delete operation with 204 status code
 */
export async function deleteUserSecret(
  userId: string, 
  hardDelete: boolean = false,
  deletionReason: string = 'User request - GDPR Article 17'
): Promise<VaultDeleteResult> {
  const startTime = Date.now();
  const secretName = getSpotifySecretName(userId);
  
  try {
    const supabase = getSupabaseAdmin();
    
    let result;
    
    if (hardDelete) {
      // Use the existing GDPR hard delete function
      const { data, error } = await supabase
        .rpc('gdpr_hard_delete_user_secret', {
          p_user_id: userId,
          p_secret_name: secretName,
          p_deletion_reason: deletionReason
        });
      
      result = { data, error };
    } else {
      // Use the existing GDPR soft delete function
      const { data, error } = await supabase
        .rpc('gdpr_soft_delete_user_secret', {
          p_user_id: userId,
          p_secret_name: secretName,
          p_deletion_reason: deletionReason
        });
      
      result = { data, error };
    }
    
    const elapsedMs = Date.now() - startTime;
    
    if (result.error) {
      logVaultOperation(userId, hardDelete ? 'hard_delete' : 'soft_delete', elapsedMs, false, result.error.message);
      return {
        success: false,
        status_code: 500,
        elapsed_ms: elapsedMs,
        error: result.error.message
      };
    }
    
    const deleteResult = result.data as { success: boolean; status_code: number };
    const success = deleteResult.success;
    const statusCode = deleteResult.status_code;
    
    logVaultOperation(userId, hardDelete ? 'hard_delete' : 'soft_delete', elapsedMs, success);
    
    return {
      success,
      status_code: statusCode,
      elapsed_ms: elapsedMs
    };
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logVaultOperation(userId, hardDelete ? 'hard_delete' : 'soft_delete', elapsedMs, false, errorMessage);
    
    return {
      success: false,
      status_code: 500,
      elapsed_ms: elapsedMs,
      error: errorMessage
    };
  }
} 