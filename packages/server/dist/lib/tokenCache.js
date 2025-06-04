/**
 * In-process memory cache implementation
 * Simple Map-based cache with TTL functionality
 * Used as default, scales to single server instance
 */
class InProcessTokenCache {
    constructor() {
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
        this.defaultTtlSeconds = 60; // 60 second TTL per user as specified
    }
    /**
     * Get token data from cache if not expired
     * @param {string} userId - The user's UUID
     * @returns {Promise<SpotifyTokenData | null>} Cached token data or null if not found/expired
     */
    async get(userId) {
        const entry = this.cache.get(userId);
        if (!entry) {
            this.misses++;
            return null;
        }
        // Check if entry has expired
        const now = Date.now();
        if (now >= entry.expires_at) {
            // Remove expired entry
            this.cache.delete(userId);
            this.misses++;
            return null;
        }
        this.hits++;
        return entry.data;
    }
    /**
     * Store token data in cache with TTL
     * @param {string} userId - The user's UUID
     * @param {SpotifyTokenData} tokenData - Token data to cache
     * @param {number} ttlSeconds - TTL in seconds (default: 60)
     */
    async set(userId, tokenData, ttlSeconds = this.defaultTtlSeconds) {
        const now = Date.now();
        const entry = {
            data: tokenData,
            expires_at: now + (ttlSeconds * 1000),
            created_at: now
        };
        this.cache.set(userId, entry);
    }
    /**
     * Remove token data from cache
     * @param {string} _userId - The user's UUID (unused in error implementation)
     */
    async delete(_userId) {
        this.cache.delete(_userId);
    }
    /**
     * Clear all cached tokens
     */
    async clear() {
        this.cache.clear();
    }
    /**
     * Get cache statistics for monitoring
     * @returns {Promise<{hits: number, misses: number, size: number}>} Cache stats
     */
    async getStats() {
        return {
            hits: this.hits,
            misses: this.misses,
            size: this.cache.size
        };
    }
    /**
     * Cleanup expired entries (should be called periodically)
     * Removes entries that have passed their TTL
     * @returns {number} Number of entries cleaned up
     */
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [userId, entry] of this.cache.entries()) {
            if (now >= entry.expires_at) {
                this.cache.delete(userId);
                cleanedCount++;
            }
        }
        return cleanedCount;
    }
}
/**
 * Redis-based cache implementation for production scaling
 * Feature-flagged behind CACHE_BACKEND=redis environment variable
 * Future implementation for horizontal scaling
 */
class RedisTokenCache {
    // TODO: Implement Redis cache when scaling is needed
    // This would use a Redis client like ioredis for distributed caching
    async get(_userId) {
        throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
    }
    async set(_userId, _tokenData, _ttlSeconds) {
        throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
    }
    async delete(_userId) {
        throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
    }
    async clear() {
        throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
    }
    async getStats() {
        throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
    }
}
// Cache backend selection based on environment variable
const CACHE_BACKEND = process.env.CACHE_BACKEND || 'memory';
// Singleton cache instance
let cacheInstance = null;
/**
 * Get the configured token cache instance
 * Supports both in-process memory cache and Redis cache (feature-flagged)
 * @returns {TokenCache} The cache instance
 */
export function getTokenCache() {
    if (!cacheInstance) {
        switch (CACHE_BACKEND.toLowerCase()) {
            case 'redis':
                console.log('TOKEN_CACHE: Using Redis backend for distributed caching');
                cacheInstance = new RedisTokenCache();
                break;
            case 'memory':
            default:
                console.log('TOKEN_CACHE: Using in-process memory cache');
                cacheInstance = new InProcessTokenCache();
                break;
        }
    }
    return cacheInstance;
}
// Periodic cleanup for in-process cache
// Run every 5 minutes to remove expired entries
if (CACHE_BACKEND.toLowerCase() === 'memory') {
    const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(() => {
        const cache = getTokenCache();
        if (cache instanceof InProcessTokenCache) {
            const cleanedCount = cache.cleanup();
            if (cleanedCount > 0) {
                console.log(`TOKEN_CACHE: Cleaned up ${cleanedCount} expired cache entries`);
            }
        }
    }, CLEANUP_INTERVAL);
}
