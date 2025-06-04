import { SpotifyTokens } from '@listener/shared';
interface TokenRefreshResult {
    success: boolean;
    tokens?: SpotifyTokens;
    requires_reauth: boolean;
    error?: string;
    elapsed_ms: number;
}
declare const metrics: {
    spotify_token_refresh_failed_total: number;
    vault_write_total: number;
    cache_hits: number;
    cache_misses: number;
};
/**
 * Refresh tokens with database locking and retry logic
 * Implements SELECT ... FOR UPDATE to prevent concurrent refresh attempts
 * @param {string} userId - The user's UUID
 * @param {string} refreshToken - The refresh token to use
 * @returns {Promise<TokenRefreshResult>} Result of refresh operation
 */
export declare function refreshTokens(userId: string, refreshToken: string): Promise<TokenRefreshResult>;
/**
 * Get valid tokens for a user
 * Follows cache → Vault → refresh flow with 5-minute expiry threshold
 * @param {string} userId - The user's UUID
 * @returns {Promise<TokenRefreshResult>} Valid tokens or error
 */
export declare function getValidTokens(userId: string): Promise<TokenRefreshResult>;
/**
 * Get current service metrics for monitoring
 * @returns {object} Current metrics
 */
export declare function getMetrics(): typeof metrics;
/**
 * Health check function to verify vault connectivity
 * @returns {Promise<boolean>} True if vault is accessible
 */
export declare function healthCheck(): Promise<boolean>;
export {};
//# sourceMappingURL=tokenService.d.ts.map