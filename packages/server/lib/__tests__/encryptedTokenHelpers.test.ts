import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  createUserSecret,
  getUserSecret,
  updateUserSecret,
  deleteUserSecret,
  storeUserSecret,
  encryptedTokenHealthCheck,
  SpotifyTokenData
} from '../encryptedTokenHelpers';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockTokenData: SpotifyTokenData = {
  access_token: 'test_access_token_12345',
  refresh_token: 'test_refresh_token_67890',
  expires_at: Date.now() + 3600000,
  token_type: 'Bearer',
  scope: 'user-library-read user-read-recently-played'
};

describe('encryptedTokenHelpers', () => {
  // Store original environment variables
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Reset modules to ensure fresh imports for each test
    vi.resetModules();
    // Create a clean copy of environment variables
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('function exports', () => {
    it('should export all required functions', () => {
      expect(typeof createUserSecret).toBe('function');
      expect(typeof getUserSecret).toBe('function');
      expect(typeof updateUserSecret).toBe('function');
      expect(typeof deleteUserSecret).toBe('function');
      expect(typeof storeUserSecret).toBe('function');
      expect(typeof encryptedTokenHealthCheck).toBe('function');
    });
  });

  describe('TOKEN_ENC_KEY environment validation', () => {
    it('should throw error when TOKEN_ENC_KEY is missing in production', async () => {
      // Arrange: Set production environment without TOKEN_ENC_KEY
      process.env.NODE_ENV = 'production';
      delete process.env.TOKEN_ENC_KEY;
      
      // Re-import module to get fresh instance with new environment
      const { storeUserSecret: freshStoreUserSecret } = await import('../encryptedTokenHelpers');

      // Act & Assert: Function should throw error about missing TOKEN_ENC_KEY
      const result = await freshStoreUserSecret(TEST_USER_ID, mockTokenData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('TOKEN_ENC_KEY environment variable must be set in production environment');
      expect(result.error).toContain('secure 32+ character encryption key');
    });
    
    it('should throw error when TOKEN_ENC_KEY uses default value in production', async () => {
      // Arrange: Set production environment with default key
      process.env.NODE_ENV = 'production';
      process.env.TOKEN_ENC_KEY = 'default-dev-key-change-in-production';
      
      // Re-import module to get fresh instance with new environment
      const { storeUserSecret: freshStoreUserSecret } = await import('../encryptedTokenHelpers');

      // Act & Assert: Function should throw error about using default key
      const result = await freshStoreUserSecret(TEST_USER_ID, mockTokenData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('TOKEN_ENC_KEY cannot use the default development key in production environment');
    });
    
    it('should work in development with custom TOKEN_ENC_KEY', async () => {
      // Arrange: Set development environment with custom key
      process.env.NODE_ENV = 'development';
      process.env.TOKEN_ENC_KEY = 'my-custom-dev-key-for-testing-12345';
      
      // Re-import module to get fresh instance with new environment
      const { storeUserSecret: freshStoreUserSecret } = await import('../encryptedTokenHelpers');

      // Act: Function should handle custom key gracefully (will fail due to no Supabase, but not due to key validation)
      const result = await freshStoreUserSecret(TEST_USER_ID, mockTokenData);
      
      // Assert: Should fail for Supabase reasons, not TOKEN_ENC_KEY validation
      expect(result.success).toBe(false);
      expect(result.error).not.toContain('TOKEN_ENC_KEY');
    });
    
    it('should warn and use default key in development when TOKEN_ENC_KEY is not set', async () => {
      // Arrange: Set development environment without TOKEN_ENC_KEY
      process.env.NODE_ENV = 'development';
      delete process.env.TOKEN_ENC_KEY;
      
      // Mock console.warn to capture warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Re-import module to get fresh instance with new environment
      const { storeUserSecret: freshStoreUserSecret } = await import('../encryptedTokenHelpers');

      // Act: Function should use default key with warning
      const result = await freshStoreUserSecret(TEST_USER_ID, mockTokenData);
      
      // Assert: Should show warning about using default key
      expect(warnSpy).toHaveBeenCalledWith('⚠️  Using default encryption key for development. Set TOKEN_ENC_KEY for production-like testing.');
      
      // Should fail for Supabase reasons, not TOKEN_ENC_KEY validation
      expect(result.success).toBe(false);
      expect(result.error).not.toContain('TOKEN_ENC_KEY must be set');
      
      warnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle missing environment variables gracefully', async () => {
      // These tests will fail due to missing environment variables in test environment
      // which is expected behavior - the functions should fail gracefully
      const result = await createUserSecret(TEST_USER_ID, mockTokenData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
    
    it('should return proper error structure for all functions', async () => {
      const functions = [
        () => createUserSecret(TEST_USER_ID, mockTokenData),
        () => getUserSecret(TEST_USER_ID),
        () => updateUserSecret(TEST_USER_ID, mockTokenData),
        () => storeUserSecret(TEST_USER_ID, mockTokenData)
      ];
      
      for (const fn of functions) {
        const result = await fn();
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('elapsed_ms');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.elapsed_ms).toBe('number');
      }
    });
    
    it('should handle delete function error structure', async () => {
      const result = await deleteUserSecret(TEST_USER_ID);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status_code');
      expect(result).toHaveProperty('elapsed_ms');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.status_code).toBe('number');
      expect(typeof result.elapsed_ms).toBe('number');
    });
    
    it('should handle health check gracefully', async () => {
      const result = await encryptedTokenHealthCheck();
      expect(typeof result).toBe('boolean');
    });
  });
}); 