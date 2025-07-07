import { afterAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// This test suite verifies the newsletter_editions migration for sent_at works as expected.
// It checks insert and fetch functionality for the new sent_at column.

// Use environment variables for local Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-local-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Static test user ID - this should exist in your local auth.users table
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Use a unique edition date for each test to avoid conflicts
const editionDateWithSentAt = '2025-07-02';
const editionDateWithNull = '2025-07-03';
const testEmail = 'test@example.com';

// Clean up any test data after all tests
afterAll(async () => {
  await supabase
    .from('newsletter_editions')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .in('edition_date', [editionDateWithSentAt, editionDateWithNull]);
});

describe('newsletter_editions migration (sent_at column)', () => {
  test('can insert and fetch newsletter edition with a specific sent_at value', async () => {
    const sentAtValue = '2025-07-07T12:00:00Z';
    // Insert a row with sent_at set
    const { data: insertData, error: insertError } = await supabase
      .from('newsletter_editions')
      .insert({
        user_id: TEST_USER_ID,
        edition_date: editionDateWithSentAt,
        status: 'generated',
        user_email: testEmail,
        content: '<div>Test content with sent_at</div>',
        model: 'gpt-4',
        error_message: null,
        sent_at: sentAtValue
      })
      .select();
    expect(insertError).toBeNull();
    expect(insertData).toBeTruthy();
    expect(insertData![0].sent_at).toBe(sentAtValue);

    // Fetch the row and verify sent_at
    const { data: fetchData, error: fetchError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('edition_date', editionDateWithSentAt);
    expect(fetchError).toBeNull();
    expect(fetchData).toHaveLength(1);
    expect(fetchData![0].sent_at).toBe(sentAtValue);
    expect(fetchData![0].content).toBe('<div>Test content with sent_at</div>');
  });

  test('can insert and fetch newsletter edition with sent_at as NULL', async () => {
    // Insert a row with sent_at as NULL
    const { data: insertData, error: insertError } = await supabase
      .from('newsletter_editions')
      .insert({
        user_id: TEST_USER_ID,
        edition_date: editionDateWithNull,
        status: 'generated',
        user_email: testEmail,
        content: '<div>Test content with sent_at NULL</div>',
        model: 'gpt-4',
        error_message: null,
        sent_at: null
      })
      .select();
    expect(insertError).toBeNull();
    expect(insertData).toBeTruthy();
    expect(insertData![0].sent_at).toBeNull();

    // Fetch the row and verify sent_at is NULL
    const { data: fetchData, error: fetchError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('edition_date', editionDateWithNull);
    expect(fetchError).toBeNull();
    expect(fetchData).toHaveLength(1);
    expect(fetchData![0].sent_at).toBeNull();
    expect(fetchData![0].content).toBe('<div>Test content with sent_at NULL</div>');
  });
}); 