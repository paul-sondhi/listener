import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Database function tests
// These tests verify that required database functions exist and work correctly
describe('Database Functions', () => {
  let supabase: any;

  beforeAll(() => {
    // Initialize Supabase client for testing using test environment variables
    const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL || 'http://localhost:54321';
    // Use test environment variables first, then fallback to regular ones
    const supabaseKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseKey) {
      throw new Error('TEST_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be set for database function tests');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  });

  afterAll(() => {
    // Clean up any test data if needed
  });

  describe('begin_token_refresh_transaction', () => {
    it('should exist and be callable', async () => {
      // Generate a test UUID for the user_id parameter
      const testUserId = '123e4567-e89b-12d3-a456-426614174000';
      
      // Call the function to verify it exists and is accessible
      const { data, error } = await supabase.rpc('begin_token_refresh_transaction', {
        p_user_id: testUserId
      });

      // The function should be callable without errors
      expect(error).toBeNull();
      
      // The function should return data with expected structure
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      // If data is returned, it should have the expected structure
      if (data && data.length > 0) {
        const result = data[0];
        expect(result).toHaveProperty('user_id');
        expect(result).toHaveProperty('locked');
        expect(typeof result.locked).toBe('boolean');
      }
    });

    it('should handle invalid UUID format gracefully', async () => {
      // Test with invalid UUID to ensure function handles edge cases
      const { data, error } = await supabase.rpc('begin_token_refresh_transaction', {
        p_user_id: 'invalid-uuid'
      });

      // Function should either work or provide meaningful error
      // We expect either success (graceful handling) or a specific UUID format error
      if (error) {
        expect(error.message).toContain('uuid');
      } else {
        expect(data).toBeDefined();
      }
    });
  });

  describe('Database Function Availability', () => {
    it('should have all required functions for token management', async () => {
      // List of functions that should exist for proper token management
      const requiredFunctions = [
        'begin_token_refresh_transaction'
      ];

      for (const functionName of requiredFunctions) {
        // Query the database to check if function exists
        const { data, error } = await supabase
          .from('pg_proc')
          .select('proname')
          .eq('proname', functionName)
          .single();

        // Function should exist in the database
        if (error && error.code !== 'PGRST116') { // PGRST116 = not found, which is what we're testing for
          console.error(`Error checking for function ${functionName}:`, error);
        }
        
        // We expect the function to exist (data should not be null)
        // If it doesn't exist, the test will fail with a descriptive message
        expect(data?.proname || null, `Function ${functionName} should exist in database`).toBe(functionName);
      }
    });
  });
}); 