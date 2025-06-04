import { describe, it, expect, vi } from 'vitest';
import { createSupabaseClient, exampleUser, API_ENDPOINTS } from '../index'; // Adjust path
import { createClient as actualCreateSupabaseClient } from '@supabase/supabase-js';

// Mock the actual '@supabase/supabase-js' createClient function
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('Shared Utilities (shared/src/index.js)', () => {
  describe('createSupabaseClient', () => {
    it('should call the actual createClient with provided env variables', () => {
      const mockEnv = {
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'test-anon-key',
      };
      const mockSupabaseInstance = { auth: {}, from: () => {} }; // Mock instance
      actualCreateSupabaseClient.mockReturnValue(mockSupabaseInstance);

      const client = createSupabaseClient(mockEnv);

      expect(actualCreateSupabaseClient).toHaveBeenCalledWith(
        mockEnv.SUPABASE_URL,
        mockEnv.SUPABASE_ANON_KEY
      );
      expect(client).toBe(mockSupabaseInstance);
    });

    it('should throw an error or handle missing env variables if appropriate', () => {
      // This test depends on how createClient from '@supabase/supabase-js' handles missing params.
      // For this example, we'll assume it might throw or return null/undefined if called with undefined.
      // We are testing our wrapper's behavior.
      const mockEnv = {}; // Missing URL and key
      actualCreateSupabaseClient.mockImplementation((url, key) => {
        if (!url || !key) {
          // Simulate Supabase client throwing error or returning a specific value for bad input
          // throw new Error('Supabase URL and Key are required');
          return null; // Or whatever the real library does
        }
        return { auth: {}, from: () => {} };
      });

      const client = createSupabaseClient(mockEnv);
      expect(actualCreateSupabaseClient).toHaveBeenCalledWith(undefined, undefined);
      // Depending on the actual Supabase client behavior for undefined inputs:
      // expect(client).toBeNull(); 
      // or expect(() => createSupabaseClient(mockEnv)).toThrow();
      // For now, just check it was called and let's assume null based on mock
      expect(client).toBeNull(); 
    });
  });

  describe('exampleUser', () => {
    it('should have the correct structure and default values', () => {
      expect(exampleUser).toEqual({
        id: '',
        email: '',
        created_at: '',
      });
    });
  });

  describe('API_ENDPOINTS', () => {
    it('should contain the correct API endpoint constants', () => {
      expect(API_ENDPOINTS).toEqual({
        AUTH: '/auth',
        USERS: '/users',
        SPOTIFY_TOKENS: '/api/spotify-tokens',
        TRANSCRIBE: '/api/transcribe',
        SYNC_SHOWS: '/api/sync-shows',
        HEALTH: '/health'
      });
    });

    it('should be an immutable object (or at least check its properties)', () => {
      // Basic check, for deeper immutability, Object.isFrozen could be used if intended.
      expect(API_ENDPOINTS.AUTH).toBe('/auth');
      // Attempt to modify - this won't throw in JS by default unless frozen,
      // but helps to document the expectation that these are constants.
      try {
        API_ENDPOINTS.AUTH = '/new-auth';
      } catch (_e) {
        // If frozen, this would throw. For now, we just check it didn't persist if not frozen.
      }
      expect(API_ENDPOINTS.AUTH).toBe('/auth'); // Should remain unchanged
    });
  });
}); 