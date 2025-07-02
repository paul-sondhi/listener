/**
 * Unit Tests for Newsletter Editions Database Helpers
 *
 * This test suite validates CRUD operations, upsert logic, soft delete behavior,
 * and input validation for the `newsletter_editions` helper module.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  insertNewsletterEdition,
  upsertNewsletterEdition,
  updateNewsletterEditionStatus,
  getByUserAndDate,
  softDelete,
  CreateNewsletterEditionParams
} from '../newsletter-editions.js';
import { resetDb } from '../../../tests/supabaseMock.js';

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

// Configure mock environment variables for Supabase client creation
process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

let supabase: SupabaseClient;

beforeAll(() => {
  // Create a shared Supabase client using the mocked SDK
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
});

beforeEach(() => {
  // Reset the in-memory mock database before each test for isolation
  resetDb();
});

// ---------------------------------------------------------------------------
// Helper: create a test user row
// ---------------------------------------------------------------------------
async function createTestUser(userId: string, email: string) {
  const { error } = await supabase
    .from('users')
    .insert({ id: userId, email });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Newsletter Editions Helpers', () => {
  const userId = 'user-1';
  const editionDate = '2025-07-04';

  it('insert + getByUserAndDate happy path', async () => {
    await createTestUser(userId, 'test@example.com');

    const params: CreateNewsletterEditionParams = {
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Hello world</p>',
      model: 'gemini-1.5-flash'
    };

    const inserted = await insertNewsletterEdition(params);
    expect(inserted.user_id).toBe(userId);
    expect(inserted.edition_date).toBe(editionDate);
    expect(inserted.deleted_at).toBeNull();

    const fetched = await getByUserAndDate(userId, editionDate);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(inserted.id);
  });

  it('upsert overwrites existing row and clears deleted_at', async () => {
    await createTestUser(userId, 'test@example.com');

    // Initial insert
    await insertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Initial</p>'
    });

    // Soft-delete the row to simulate L10 overwrite scenario
    await softDelete((await getByUserAndDate(userId, editionDate))!.id);

    // Upsert with new data – should revive (deleted_at = NULL)
    const upserted = await upsertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Updated content</p>',
      model: 'gemini-1.5-flash'
    });

    expect(upserted.content).toBe('<p>Updated content</p>');
    expect(upserted.deleted_at).toBeNull();
  });

  it('validation errors: bad date string and empty user_id', async () => {
    await createTestUser(userId, 'test@example.com');

    // Bad date
    await expect(
      insertNewsletterEdition({
        user_id: userId,
        edition_date: 'invalid-date',
        status: 'generated'
      } as any)
    ).rejects.toThrow();

    // Empty user_id
    await expect(
      insertNewsletterEdition({
        user_id: '',
        edition_date: editionDate,
        status: 'generated'
      } as any)
    ).rejects.toThrow();
  });

  it('softDelete hides row from default queries', async () => {
    await createTestUser(userId, 'test@example.com');

    const inserted = await insertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated'
    });

    // Soft delete
    await softDelete(inserted.id);

    // Default query (exclude deleted) should return null
    const noRow = await getByUserAndDate(userId, editionDate);
    expect(noRow).toBeNull();

    // Query including deleted should return the soft-deleted row
    const withDeleted = await getByUserAndDate(userId, editionDate, true);
    expect(withDeleted).not.toBeNull();
    expect(withDeleted!.deleted_at).not.toBeNull();
  });
}); 