import { afterAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// This test suite verifies the newsletter_editions migration works as expected.
// It checks insert and fetch functionality.

// Use environment variables for local Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-local-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Static test user ID - this should exist in your local auth.users table
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

describe('newsletter_editions migration', () => {
  const editionDate = '2025-07-02';
  const testEmail = 'test@example.com';

  afterAll(async () => {
    // Clean up test data after all tests
    await supabase
      .from('newsletter_editions')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('edition_date', editionDate);
  });

  test('can insert and fetch newsletter editions', async () => {
    // 1. Insert a row
    const { data: insertData, error: insertError } = await supabase
      .from('newsletter_editions')
      .insert({
        user_id: TEST_USER_ID,
        edition_date: editionDate,
        status: 'generated',
        user_email: testEmail,
        content: '<div>Test content</div>',
        model: 'gpt-4',
        error_message: null,
        sent: false
      })
      .select();
    expect(insertError).toBeNull();
    expect(insertData).toBeTruthy();
    expect(insertData![0].user_id).toBe(TEST_USER_ID);
    expect(insertData![0].edition_date).toBe(editionDate);

    // 2. Fetch the row
    const { data: fetchData, error: fetchError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('edition_date', editionDate);
    expect(fetchError).toBeNull();
    expect(fetchData).toHaveLength(1);
    expect(fetchData![0].content).toBe('<div>Test content</div>');
    expect(fetchData![0].status).toBe('generated');
    expect(fetchData![0].sent).toBe(false);
  });
}); 