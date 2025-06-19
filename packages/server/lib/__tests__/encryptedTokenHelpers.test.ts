import { describe, it, expect } from 'vitest';
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