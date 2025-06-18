import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, SpotifyTokens } from '@listener/shared';
import { getUserSecret, updateUserSecret } from '../lib/vaultHelpers.js';
import { getTokenCache, SpotifyTokenData } from '../lib/tokenCache.js';

// Local type definitions for token management
interface TokenRefreshResult {
  success: boolean;
  tokens?: SpotifyTokens;
  requires_reauth: boolean;
  error?: string;
  elapsed_ms: number;
}

interface TokenValidationResult {
  valid: boolean;
  expires_in_minutes: number;
  needs_refresh: boolean;
  error?: string;
}

interface SpotifyRateLimit {
  is_limited: boolean;
  reset_at?: number;
  retry_after_seconds?: number;
}

interface TokenServiceConfig {
  refresh_threshold_minutes: number;
  max_refresh_retries: number;
  cache_ttl_seconds: number;
  rate_limit_pause_seconds: number;
}

// Rate limiting state - global across all users
let spotifyRateLimit: SpotifyRateLimit = {
  is_limited: false
};

// Service configuration with defaults
const CONFIG: TokenServiceConfig = {
  refresh_threshold_minutes: parseInt(process.env.TOKEN_REFRESH_THRESHOLD_MINUTES || '5'),
  max_refresh_retries: parseInt(process.env.MAX_REFRESH_RETRIES || '3'),
  cache_ttl_seconds: parseInt(process.env.TOKEN_CACHE_TTL_SECONDS || '60'),
  rate_limit_pause_seconds: parseInt(process.env.RATE_LIMIT_PAUSE_SECONDS || '30')
};

// Metrics for monitoring
const metrics = {
  spotify_token_refresh_failed_total: 0,
  vault_write_total: 0,
  cache_hits: 0,
  cache_misses: 0
};

// Lazy Supabase client initialization
let supabaseAdmin: SupabaseClient<Database> | null = null;

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
 * Emit monitoring metrics to stdout for collection by monitoring systems
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {object} labels - Additional labels for the metric
 */
function emitMetric(metric: string, value: number, labels: Record<string, string> = {}): void {
  const metricData = {
    metric,
    value,
    timestamp: Date.now(),
    labels
  };
  console.log(`METRIC: ${JSON.stringify(metricData)}`);
}

/**
 * Check if tokens are valid and determine if refresh is needed
 * @param {SpotifyTokens} tokens - The tokens to validate
 * @returns {TokenValidationResult} Validation result
 */
function validateTokens(tokens: SpotifyTokens): TokenValidationResult {
  const now = Date.now();
  const expiresAt = tokens.expires_at * 1000; // Convert to milliseconds
  const thresholdMs = CONFIG.refresh_threshold_minutes * 60 * 1000; // 5 minutes in ms
  
  const timeUntilExpiry = expiresAt - now;
  const expiresInMinutes = Math.floor(timeUntilExpiry / 60000);
  
  return {
    valid: timeUntilExpiry > 0,
    expires_in_minutes: expiresInMinutes,
    needs_refresh: timeUntilExpiry < thresholdMs
  };
}

/**
 * Check if we're currently rate limited by Spotify
 * @returns {boolean} True if rate limited
 */
function isRateLimited(): boolean {
  if (!spotifyRateLimit.is_limited) {
    return false;
  }
  
  const now = Date.now();
  if (spotifyRateLimit.reset_at && now >= spotifyRateLimit.reset_at) {
    // Rate limit has expired
    spotifyRateLimit.is_limited = false;
    delete spotifyRateLimit.reset_at;
    console.log('RATE_LIMIT: Spotify rate limit has expired, resuming operations');
    return false;
  }
  
  return true;
}

/**
 * Clear rate limit state (for testing)
 */
export function clearRateLimit(): void {
  spotifyRateLimit = {
    is_limited: false
  };
}

/**
 * Set global rate limit state when Spotify returns 429
 * @param {number} retryAfterSeconds - Seconds to wait before retry
 */
function setRateLimit(retryAfterSeconds: number = CONFIG.rate_limit_pause_seconds): void {
  const now = Date.now();
  spotifyRateLimit = {
    is_limited: true,
    reset_at: now + (retryAfterSeconds * 1000),
    retry_after_seconds: retryAfterSeconds
  };
  
  console.log(`RATE_LIMIT: Spotify rate limit activated for ${retryAfterSeconds} seconds`);
  emitMetric('spotify_rate_limit_activated', 1, { retry_after_seconds: retryAfterSeconds.toString() });
}

/**
 * Refresh Spotify tokens using the refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<SpotifyTokens>} New token data
 */
async function refreshSpotifyTokens(refreshToken: string): Promise<SpotifyTokens> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId) {
    throw new Error('Missing Spotify client ID');
  }

  if (!clientSecret) {
    throw new Error('Missing Spotify client secret');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  headers['Authorization'] = `Basic ${credentials}`;

  // DEBUG LOG ① – Which flow are we using and do we have credentials?
  if (process.env.NODE_ENV !== 'test') {
    console.debug('TOKEN_REFRESH_FLOW', {
      clientIdPresent: !!clientId,
      clientSecretPresent: !!clientSecret
    });
  }

  // DEBUG LOG ② – Outgoing request details (sanitised)
  if (process.env.NODE_ENV !== 'test') {
    console.debug('TOKEN_REFRESH_REQUEST', {
      headers: Object.keys(headers),
      body: body.toString().replace(/refresh_token=[^&]+/, 'refresh_token=****')
    });
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers,
    body
  });
  
  // DEBUG LOG ③ – Response status code
  if (process.env.NODE_ENV !== 'test') {
    console.debug('TOKEN_REFRESH_RESPONSE_STATUS', response.status);
  }
  
  if (response.status === 429) {
    // Handle rate limiting
    const retryAfter = parseInt(response.headers.get('retry-after') || '30');
    setRateLimit(retryAfter);
    throw new Error(`Spotify rate limited: retry after ${retryAfter} seconds`);
  }
  
  if (!response.ok) {
    // --- Robust error parsing ---
    // Some mocked Response objects (e.g. in unit tests) may only implement
    // either text() or json(), but not both. We therefore try json() first
    // (because the Spotify API returns JSON on error) and gracefully fall back
    // to text() if json() is unavailable or fails.

    let parsedBody: Record<string, any> | null = null;
    let rawBody = '';

    // Attempt to read JSON body if the helper is available
    if (typeof (response as any).json === 'function') {
      try {
        parsedBody = await (response as any).json();
      } catch {
        // ignore – we will try text() next
      }
    }

    // If JSON parsing failed or not available, try text()
    if (!parsedBody && typeof (response as any).text === 'function') {
      try {
        rawBody = await (response as any).text();
      } catch {
        // ignore – we tried our best
      }
    }

    // If we only got raw text, attempt JSON.parse on it – in many cases the
    // Spotify error response is still JSON even if we used text().
    if (!parsedBody && rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // not JSON – keep rawBody as plain text
      }
    }

    // Derive a human-friendly error message
    const msg = parsedBody?.error_description || parsedBody?.error || rawBody || 'Unknown error';

    if (process.env.NODE_ENV !== 'test') {
      console.error('TOKEN_REFRESH_FAILURE', {
        status: response.status,
        body: typeof rawBody === 'string' ? rawBody.slice(0, 500) : rawBody,
        parsedBody
      });
    }

    throw new Error(`Spotify refresh failed: ${response.status} - ${msg}`);
  }
  
  const tokenData = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || refreshToken, // Some responses don't include new refresh token
    expires_in: tokenData.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope || ''
  };
}

/**
 * Refresh tokens with database locking and retry logic
 * Implements SELECT ... FOR UPDATE to prevent concurrent refresh attempts
 * @param {string} userId - The user's UUID
 * @param {string} refreshToken - The refresh token to use
 * @returns {Promise<TokenRefreshResult>} Result of refresh operation
 */
export async function refreshTokens(userId: string, refreshToken: string): Promise<TokenRefreshResult> {
  const startTime = Date.now();
  
  // Check rate limiting before attempting refresh
  if (isRateLimited()) {
    return {
      success: false,
      requires_reauth: false,
      error: 'Spotify API rate limited, please try again later',
      elapsed_ms: Date.now() - startTime
    };
  }
  
  const supabase = getSupabaseAdmin();
  
  try {
    // Use SELECT ... FOR UPDATE to lock the user row during refresh
    // This prevents concurrent refresh attempts for the same user
    const { data: _lockedUser, error: lockError } = await supabase
      .rpc('begin_token_refresh_transaction', { p_user_id: userId });
    
    if (lockError) {
      console.error('Failed to acquire user lock for token refresh:', lockError);
      return {
        success: false,
        requires_reauth: false,
        error: 'Failed to acquire lock for token refresh',
        elapsed_ms: Date.now() - startTime
      };
    }
    
    let retryCount = 0;
    let lastError: string = '';
    
    while (retryCount <= CONFIG.max_refresh_retries) {
      try {
        console.log(`TOKEN_REFRESH: Attempting refresh for user ${userId} (attempt ${retryCount + 1})`);
        
        // Attempt to refresh tokens
        const newTokens = await refreshSpotifyTokens(refreshToken);
        
        // Convert to vault format
        const vaultTokenData: SpotifyTokenData = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: newTokens.expires_at,
          token_type: newTokens.token_type,
          scope: newTokens.scope
        };
        
        // Update tokens in vault
        const vaultResult = await updateUserSecret(userId, vaultTokenData);
        
        if (!vaultResult.success) {
          console.error('Failed to update tokens in vault:', vaultResult.error);
          throw new Error(`Vault update failed: ${vaultResult.error}`);
        }
        
        // Update cache
        const cache = getTokenCache();
        await cache.set(userId, vaultTokenData, CONFIG.cache_ttl_seconds);
        
        // Clear reauth flag on successful refresh
        await supabase
          .from('users')
          .update({ spotify_reauth_required: false })
          .eq('id', userId);
        
        // Emit success metrics
        emitMetric('spotify_token_refresh_success_total', 1, { user_id: userId });
        emitMetric('vault_write_total', 1, { operation: 'token_refresh' });
        metrics.vault_write_total++;
        
        const elapsedMs = Date.now() - startTime;
        console.log(`TOKEN_REFRESH: Successfully refreshed tokens for user ${userId} in ${elapsedMs}ms`);
        
        return {
          success: true,
          tokens: newTokens,
          requires_reauth: false,
          elapsed_ms: elapsedMs
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        lastError = errorMessage;
        retryCount++;
        
        console.warn(`TOKEN_REFRESH: Attempt ${retryCount} failed for user ${userId}: ${errorMessage}`);
        
        // If this was a 401 (invalid refresh token), don't retry
        if (errorMessage.includes('401') || errorMessage.includes('invalid_grant')) {
          console.error(`TOKEN_REFRESH: Invalid refresh token for user ${userId}, setting reauth required`);
          
          // Set reauth required flag
          await supabase
            .from('users')
            .update({ spotify_reauth_required: true })
            .eq('id', userId);
          
          // Clear cached tokens
          const cache = getTokenCache();
          await cache.delete(userId);
          
          // Emit failure metric
          emitMetric('spotify_token_refresh_failed_total', 1, { 
            user_id: userId, 
            reason: 'invalid_refresh_token' 
          });
          metrics.spotify_token_refresh_failed_total++;
          
          return {
            success: false,
            requires_reauth: true,
            error: 'Invalid refresh token - user must re-authenticate',
            elapsed_ms: Date.now() - startTime
          };
        }
        
        // Handle 400 invalid_request errors - often means refresh token is expired/invalid
        if (errorMessage.includes('400') && errorMessage.includes('invalid_request')) {
          console.error(`TOKEN_REFRESH: Invalid request (400) for user ${userId}, likely expired refresh token, setting reauth required`);
          
          // Set reauth required flag
          await supabase
            .from('users')
            .update({ spotify_reauth_required: true })
            .eq('id', userId);
          
          // Clear cached tokens
          const cache = getTokenCache();
          await cache.delete(userId);
          
          // Emit failure metric
          emitMetric('spotify_token_refresh_failed_total', 1, { 
            user_id: userId, 
            reason: 'invalid_request_400' 
          });
          metrics.spotify_token_refresh_failed_total++;
          
          return {
            success: false,
            requires_reauth: true,
            error: 'Invalid refresh token (400 invalid_request) - user must re-authenticate',
            elapsed_ms: Date.now() - startTime
          };
        }
        
        // For rate limiting or temporary errors, wait before retry
        if (retryCount <= CONFIG.max_refresh_retries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
          console.log(`TOKEN_REFRESH: Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries exhausted
    console.error(`TOKEN_REFRESH: All ${CONFIG.max_refresh_retries} retries exhausted for user ${userId}`);
    
    // Emit failure metric
    emitMetric('spotify_token_refresh_failed_total', 1, { 
      user_id: userId, 
      reason: 'max_retries_exceeded' 
    });
    metrics.spotify_token_refresh_failed_total++;
    
    return {
      success: false,
      requires_reauth: false,
      error: `Token refresh failed after ${CONFIG.max_refresh_retries} retries: ${lastError}`,
      elapsed_ms: Date.now() - startTime
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`TOKEN_REFRESH: Unexpected error for user ${userId}:`, errorMessage);
    
    emitMetric('spotify_token_refresh_failed_total', 1, { 
      user_id: userId, 
      reason: 'unexpected_error' 
    });
    metrics.spotify_token_refresh_failed_total++;
    
    return {
      success: false,
      requires_reauth: false,
      error: `Unexpected error during token refresh: ${errorMessage}`,
      elapsed_ms: Date.now() - startTime
    };
  }
}

/**
 * Get valid tokens for a user
 * Follows cache → Vault → refresh flow with 5-minute expiry threshold
 * @param {string} userId - The user's UUID
 * @returns {Promise<TokenRefreshResult>} Valid tokens or error
 */
export async function getValidTokens(userId: string): Promise<TokenRefreshResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Check cache first
    const cache = getTokenCache();
    let tokenData = await cache.get(userId);
    
    if (tokenData) {
      console.log(`TOKEN_SERVICE: Cache hit for user ${userId}`);
      metrics.cache_hits++;
      emitMetric('token_cache_hits_total', 1, { user_id: userId });
      
      // Validate cached tokens
      const validation = validateTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_at - Math.floor(Date.now() / 1000),
        expires_at: tokenData.expires_at,
        token_type: tokenData.token_type,
        scope: tokenData.scope
      });
      
      if (validation.valid && !validation.needs_refresh) {
        return {
          success: true,
          tokens: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_at - Math.floor(Date.now() / 1000),
            expires_at: tokenData.expires_at,
            token_type: tokenData.token_type,
            scope: tokenData.scope
          },
          requires_reauth: false,
          elapsed_ms: Date.now() - startTime
        };
      }
      
      console.log(`TOKEN_SERVICE: Cached tokens for user ${userId} need refresh (expires in ${validation.expires_in_minutes} minutes)`);
    } else {
      console.log(`TOKEN_SERVICE: Cache miss for user ${userId}`);
      metrics.cache_misses++;
      emitMetric('token_cache_misses_total', 1, { user_id: userId });
    }
    
    // Step 2: Get from Vault if not in cache or cache is stale
    if (!tokenData) {
      const vaultResult = await getUserSecret(userId);
      
      if (!vaultResult.success) {
        console.log(`TOKEN_SERVICE: No tokens found in vault for user ${userId}`);
        return {
          success: false,
          requires_reauth: true,
          error: 'No tokens found - user must authenticate',
          elapsed_ms: Date.now() - startTime
        };
      }
      
      tokenData = vaultResult.data!;
      
      // Update cache with vault data
      await cache.set(userId, tokenData, CONFIG.cache_ttl_seconds);
    }
    
    // Step 3: Check if tokens need refresh (expires < now + 5 min)
    const validation = validateTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_at - Math.floor(Date.now() / 1000),
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type,
      scope: tokenData.scope
    });
    
    if (!validation.needs_refresh) {
      console.log(`TOKEN_SERVICE: Vault tokens for user ${userId} are still valid (expires in ${validation.expires_in_minutes} minutes)`);
      return {
        success: true,
        tokens: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_at - Math.floor(Date.now() / 1000),
          expires_at: tokenData.expires_at,
          token_type: tokenData.token_type,
          scope: tokenData.scope
        },
        requires_reauth: false,
        elapsed_ms: Date.now() - startTime
      };
    }
    
    // Step 4: Refresh tokens
    console.log(`TOKEN_SERVICE: Refreshing tokens for user ${userId} (expires in ${validation.expires_in_minutes} minutes)`);
    return await refreshTokens(userId, tokenData.refresh_token);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`TOKEN_SERVICE: Error getting valid tokens for user ${userId}:`, errorMessage);
    
    return {
      success: false,
      requires_reauth: false,
      error: `Failed to get valid tokens: ${errorMessage}`,
      elapsed_ms: Date.now() - startTime
    };
  }
}

/**
 * Get current service metrics for monitoring
 * @returns {object} Current metrics
 */
export function getMetrics(): typeof metrics {
  return { ...metrics };
}

/**
 * Health check function to verify vault connectivity
 * @returns {Promise<boolean>} True if vault is accessible
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Test vault connectivity using RPC function (vault schema is not directly accessible via REST API)
    const { data, error } = await supabase.rpc('test_vault_count');
    
    if (error) {
      console.error('TOKEN_SERVICE: Vault health check failed:', error.message);
      return false;
    }
    
    // Verify we got a valid count response
    if (typeof data !== 'number') {
      console.error('TOKEN_SERVICE: Vault health check failed: invalid response format');
      return false;
    }
    
    console.log(`TOKEN_SERVICE: Vault health check passed - ${data} secrets in vault`);
    return true;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('TOKEN_SERVICE: Health check error:', errorMessage);
    return false;
  }
} 