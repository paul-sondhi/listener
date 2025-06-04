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
/**
 * Create a new user secret in Vault
 * Stores Spotify tokens as JSON in format: spotify:{userId}:tokens
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The Spotify token data to store
 * @returns {Promise<VaultOperationResult>} Result of the create operation
 */
export declare function createUserSecret(userId: string, tokenData: SpotifyTokenData): Promise<VaultOperationResult>;
/**
 * Get user secret from Vault
 * Reads and parses Spotify tokens for the given user
 * @param {string} userId - The user's UUID
 * @returns {Promise<VaultOperationResult>} Result with parsed token data
 */
export declare function getUserSecret(userId: string): Promise<VaultOperationResult>;
/**
 * Update user secret in Vault
 * Overwrites existing Spotify tokens in place
 * @param {string} userId - The user's UUID
 * @param {SpotifyTokenData} tokenData - The updated Spotify token data
 * @returns {Promise<VaultOperationResult>} Result of the update operation
 */
export declare function updateUserSecret(userId: string, tokenData: SpotifyTokenData): Promise<VaultOperationResult>;
/**
 * Delete user secret from Vault
 * Supports both soft delete (GDPR compliance) and hard delete
 * @param {string} userId - The user's UUID
 * @param {boolean} hardDelete - Whether to perform hard delete (default: false for soft delete)
 * @param {string} deletionReason - Reason for deletion (for GDPR compliance)
 * @returns {Promise<VaultDeleteResult>} Result of the delete operation with 204 status code
 */
export declare function deleteUserSecret(userId: string, hardDelete?: boolean, deletionReason?: string): Promise<VaultDeleteResult>;
export {};
//# sourceMappingURL=vaultHelpers.d.ts.map