import { SpotifyTokenData } from './vaultHelpers';

// Cache entry interface with TTL
interface CacheEntry {
  data: SpotifyTokenData;
  expires_at: number; // Unix timestamp in milliseconds
  created_at: number; // Unix timestamp in milliseconds
}

// Cache interface for future Redis implementation
interface TokenCache {
  get(userId: string): Promise<SpotifyTokenData | null>;
  set(userId: string, tokenData: SpotifyTokenData, ttlSeconds?: number): Promise<void>;
  delete(userId: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<{ hits: number; misses: number; size: number }>;
}

/**
 * In-process memory cache implementation
 * Simple Map-based cache with TTL functionality
 * Used as default, scales to single server instance
 */
class InProcessTokenCache implements TokenCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private readonly defaultTtlSeconds = 60; // 60 second TTL per user as specified

  /**
   * Get token data from cache if not expired
   * @param {string} userId - The user's UUID
   * @returns {Promise<SpotifyTokenData | null>} Cached token data or null if not found/expired
   */
  async get(userId: string): Promise<SpotifyTokenData | null> {
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
  async set(userId: string, tokenData: SpotifyTokenData, ttlSeconds = this.defaultTtlSeconds): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry = {
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
  async delete(_userId: string): Promise<void> {
    this.cache.delete(_userId);
  }

  /**
   * Clear all cached tokens
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Promise<{hits: number, misses: number, size: number}>} Cache stats
   */
  async getStats(): Promise<{ hits: number; misses: number; size: number }> {
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
  cleanup(): number {
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
class RedisTokenCache implements TokenCache {
  // TODO: Implement Redis cache when scaling is needed
  // This would use a Redis client like ioredis for distributed caching
  
  async get(_userId: string): Promise<SpotifyTokenData | null> {
    throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
  }

  async set(_userId: string, _tokenData: SpotifyTokenData, _ttlSeconds?: number): Promise<void> {
    throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
  }

  async delete(_userId: string): Promise<void> {
    throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
  }

  async clear(): Promise<void> {
    throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
  }

  async getStats(): Promise<{ hits: number; misses: number; size: number }> {
    throw new Error('Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.');
  }
}

// Cache backend selection based on environment variable
const CACHE_BACKEND = process.env.CACHE_BACKEND || 'memory';

// Singleton cache instance
let cacheInstance: TokenCache | null = null;

/**
 * Get the configured token cache instance
 * Supports both in-process memory cache and Redis cache (feature-flagged)
 * @returns {TokenCache} The cache instance
 */
export function getTokenCache(): TokenCache {
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

// Export the SpotifyTokenData type for use in other modules
export type { SpotifyTokenData } from './vaultHelpers'; 