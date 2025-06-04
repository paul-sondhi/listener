import { SpotifyTokenData } from './vaultHelpers';
interface TokenCache {
    get(userId: string): Promise<SpotifyTokenData | null>;
    set(userId: string, tokenData: SpotifyTokenData, ttlSeconds?: number): Promise<void>;
    delete(userId: string): Promise<void>;
    clear(): Promise<void>;
    getStats(): Promise<{
        hits: number;
        misses: number;
        size: number;
    }>;
}
/**
 * Get the configured token cache instance
 * Supports both in-process memory cache and Redis cache (feature-flagged)
 * @returns {TokenCache} The cache instance
 */
export declare function getTokenCache(): TokenCache;
export type { SpotifyTokenData } from './vaultHelpers';
//# sourceMappingURL=tokenCache.d.ts.map