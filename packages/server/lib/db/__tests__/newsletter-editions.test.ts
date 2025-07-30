/**
 * Unit Tests for Newsletter Editions Database Helpers
 *
 * This test suite validates CRUD operations, upsert logic, soft delete behavior,
 * and input validation for the `newsletter_editions` helper module.
 */

// Helper function to generate a unique ID for test isolation
function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Helper function to create test user
async function createTestUser(userId: string, email: string) {
  const { error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
}

// Helper function to create test newsletter edition
async function _createTestNewsletterEdition(id: string, userId: string, editionDate: string) {
  const { error } = await supabase
    .from('newsletter_editions')
    .insert({
      id,
      user_id: userId,
      edition_date: editionDate,
      status: 'completed',
      content: 'Test newsletter content',
      user_email: 'test@example.com'
    });
  if (error) throw new Error(`Failed to create test newsletter edition: ${error.message}`);
}

async function createTestPodcastShow(id: string, title: string) {
  const { error } = await supabase
    .from('podcast_shows')
    .insert({
      id,
      title,
      spotify_url: 'https://open.spotify.com/show/test',
      rss_url: 'https://example.com/rss.xml'
    });
  if (error) throw new Error(`Failed to create test podcast show: ${error.message}`);
}

async function createTestEpisode(id: string, showId: string, title: string) {
  const { error } = await supabase
    .from('podcast_episodes')
    .insert({
      id,
      title,
      description: 'Test episode description',
      pub_date: '2025-01-27T12:00:00Z',
      duration_sec: 1800,
      episode_url: 'https://open.spotify.com/episode/test',
      show_id: showId,
      guid: `test-guid-${id}`
    });
  if (error) throw new Error(`Failed to create test episode: ${error.message}`);
}

async function createTestEpisodeTranscriptNote(episodeId: string, notes: string) {
  const { error } = await supabase
    .from('episode_transcript_notes')
    .insert({
      episode_id: episodeId,
      notes,
      status: 'completed',
      model: 'test-model',
      input_tokens: 100,
      output_tokens: 50
    });
  if (error) throw new Error(`Failed to create test episode transcript note: ${error.message}`);
}

// Test data IDs for cleanup
let testNewsletterIds: string[] = [];
let testEpisodeIds: string[] = [];
let testShowIds: string[] = [];
let testUserId: string | null = null;

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  insertNewsletterEdition,
  upsertNewsletterEdition,
  _updateNewsletterEditionStatus,
  getByUserAndDate,
  softDelete,
  insertNewsletterEditionWithEpisodes,
  getNewsletterEditionWithEpisodes,
  deleteNewsletterEditionWithEpisodes,
  type CreateNewsletterEditionParams,
  type CreateNewsletterEditionWithEpisodesParams
} from '../newsletter-editions';
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
// Tests
// ---------------------------------------------------------------------------

describe('Newsletter Editions Database Helpers', () => {
  // Only run when the test runner has the necessary credentials
  const hasCredentials = Boolean(
    process.env.SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Dynamically skip when credentials are missing to avoid local dev pain
  const maybeDescribe = hasCredentials ? describe : describe.skip;

  beforeAll(async () => {
    if (!hasCredentials) return;

    // Verify database connection and newsletter_editions table exists
    const { data: _data, error } = await supabase
      .from('newsletter_editions')
      .select('count')
      .limit(0)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database connection failed or newsletter_editions table missing: ${error.message}`);
    }
  });

  beforeEach(() => {
    // Reset cleanup tracking for each test
    testNewsletterIds = [];
    testEpisodeIds = [];
    testShowIds = [];
    testUserId = null;
  });

  afterEach(async () => {
    if (!hasCredentials) return;

    // Clean up test data after each test (in reverse dependency order)
    if (testNewsletterIds.length > 0) {
      await supabase
        .from('newsletter_editions')
        .delete()
        .in('id', testNewsletterIds);
    }

    if (testEpisodeIds.length > 0) {
      await supabase
        .from('episode_transcript_notes')
        .delete()
        .in('episode_id', testEpisodeIds);
      
      await supabase
        .from('podcast_episodes')
        .delete()
        .in('id', testEpisodeIds);
    }

    if (testShowIds.length > 0) {
      await supabase
        .from('podcast_shows')
        .delete()
        .in('id', testShowIds);
    }

    if (testUserId) {
      await supabase
        .from('users')
        .delete()
        .eq('id', testUserId);
    }
  });

  maybeDescribe('insertNewsletterEdition', () => {
    it('should successfully insert a newsletter edition', async () => {
      // Set up test data
      const userId = uniqueId('user');
      const newsletterId = uniqueId('newsletter');

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      const params: CreateNewsletterEditionParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro'
      };

      const result = await insertNewsletterEdition(params);

      expect(result).toBeDefined();
      expect(result.user_id).toBe(userId);
      expect(result.edition_date).toBe('2025-01-27');
      expect(result.status).toBe('generated');
      expect(result.content).toBe('Test newsletter content');
      expect(result.model).toBe('gemini-pro');
      expect(result.user_email).toBe('test@example.com');
      expect(result.deleted_at).toBeNull();

      testNewsletterIds.push(newsletterId);
    });

    it('should successfully insert a newsletter edition with episode tracking', async () => {
      // Set up test data
      const userId = uniqueId('user');
      const showId = uniqueId('show');
      const episodeId = uniqueId('episode');

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId);

      await createTestEpisodeTranscriptNote(episodeId, 'Test notes 1');

      const params: CreateNewsletterEditionParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro',
        episode_ids: [episodeId]
      };

      const result = await insertNewsletterEdition(params);

      expect(result).toBeDefined();
      expect(result.user_id).toBe(userId);
      expect(result.edition_date).toBe('2025-01-27');
      expect(result.status).toBe('generated');

      // Verify episode link was created
      const { data: episodeLinks, error: linksError } = await supabase
        .from('newsletter_edition_episodes')
        .select('*')
        .eq('newsletter_edition_id', result.id);
      
      expect(linksError).toBeNull();
      expect(episodeLinks).toHaveLength(1);
      expect(episodeLinks![0].episode_id).toBe(episodeId);

      testNewsletterIds.push(result.id);
    });
  });

  maybeDescribe('insertNewsletterEditionWithEpisodes', () => {
    it('should successfully insert a newsletter edition with episode tracking (atomic operation)', async () => {
      // Set up test data
      const userId = uniqueId('user');
      const showId = uniqueId('show');
      const episodeId1 = uniqueId('episode');
      const episodeId2 = uniqueId('episode');

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      testEpisodeIds.push(episodeId1, episodeId2);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');

      const params: CreateNewsletterEditionWithEpisodesParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro',
        episode_ids: [episodeId1, episodeId2]
      };

      const result = await insertNewsletterEditionWithEpisodes(params);

      expect(result).toBeDefined();
      expect(result.newsletter_edition).toBeDefined();
      expect(result.newsletter_edition.user_id).toBe(userId);
      expect(result.newsletter_edition.edition_date).toBe('2025-01-27');
      expect(result.newsletter_edition.status).toBe('generated');
      expect(result.episode_links).toHaveLength(2);
      expect(result.episode_count).toBe(2);

      // Verify episode links were created
      const episodeIds = result.episode_links.map(link => link.episode_id);
      expect(episodeIds).toContain(episodeId1);
      expect(episodeIds).toContain(episodeId2);

      testNewsletterIds.push(result.newsletter_edition.id);
    });

    it('should throw error when episode_ids is empty', async () => {
      const userId = uniqueId('user');
      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      const params: CreateNewsletterEditionWithEpisodesParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro',
        episode_ids: []
      };

      await expect(insertNewsletterEditionWithEpisodes(params)).rejects.toThrow(
        'episode_ids is required and must be a non-empty array'
      );
    });

    it('should throw error when episode_ids is missing', async () => {
      const userId = uniqueId('user');
      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      const params = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro'
      } as CreateNewsletterEditionWithEpisodesParams;

      await expect(insertNewsletterEditionWithEpisodes(params)).rejects.toThrow(
        'episode_ids is required and must be a non-empty array'
      );
    });
  });

  maybeDescribe('getNewsletterEditionWithEpisodes', () => {
    it('should successfully retrieve a newsletter edition with episode links', async () => {
      // Set up test data
      const userId = uniqueId('user');
      const showId = uniqueId('show');
      const episodeId = uniqueId('episode');

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId);

      await createTestEpisodeTranscriptNote(episodeId, 'Test notes 1');

      // Create newsletter edition with episode tracking
      const params: CreateNewsletterEditionWithEpisodesParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro',
        episode_ids: [episodeId]
      };

      const created = await insertNewsletterEditionWithEpisodes(params);

      // Retrieve the newsletter edition with episodes
      const result = await getNewsletterEditionWithEpisodes(created.newsletter_edition.id);

      expect(result).toBeDefined();
      expect(result!.newsletter_edition.id).toBe(created.newsletter_edition.id);
      expect(result!.newsletter_edition.user_id).toBe(userId);
      expect(result!.newsletter_edition.edition_date).toBe('2025-01-27');
      expect(result!.episode_links).toHaveLength(1);
      expect(result!.episode_count).toBe(1);
      expect(result!.episode_links[0].episode_id).toBe(episodeId);

      testNewsletterIds.push(created.newsletter_edition.id);
    });

    it('should return null for non-existent newsletter edition', async () => {
      const result = await getNewsletterEditionWithEpisodes('non-existent-id');
      expect(result).toBeNull();
    });

    it('should throw error for invalid newsletter_edition_id', async () => {
      await expect(getNewsletterEditionWithEpisodes('')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });
  });

  maybeDescribe('deleteNewsletterEditionWithEpisodes', () => {
    it('should successfully delete a newsletter edition with episode links (atomic operation)', async () => {
      // Set up test data
      const userId = uniqueId('user');
      const showId = uniqueId('show');
      const episodeId = uniqueId('episode');

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId);

      await createTestEpisodeTranscriptNote(episodeId, 'Test notes 1');

      // Create newsletter edition with episode tracking
      const params: CreateNewsletterEditionWithEpisodesParams = {
        user_id: userId,
        edition_date: '2025-01-27',
        status: 'generated',
        content: 'Test newsletter content',
        model: 'gemini-pro',
        episode_ids: [episodeId]
      };

      const created = await insertNewsletterEditionWithEpisodes(params);
      testNewsletterIds.push(created.newsletter_edition.id);

      // Delete the newsletter edition with episodes
      const deletedEpisodeCount = await deleteNewsletterEditionWithEpisodes(created.newsletter_edition.id);

      expect(deletedEpisodeCount).toBe(1);

      console.log('Created newsletter edition ID:', created.newsletter_edition.id);
      console.log('User ID:', created.newsletter_edition.user_id);
      console.log('Edition date:', '2025-01-27');

      // Verify newsletter edition is soft deleted
      const newsletterEdition = await getByUserAndDate(created.newsletter_edition.user_id, '2025-01-27', true);

      expect(newsletterEdition).not.toBeNull();

      // Verify episode links are deleted
      const { data: episodeLinks, error: linksError } = await supabase
        .from('newsletter_edition_episodes')
        .select('*')
        .eq('newsletter_edition_id', created.newsletter_edition.id);

      expect(linksError).toBeNull();
      expect(episodeLinks).toHaveLength(0);
    });

    it('should throw error for invalid newsletter_edition_id', async () => {
      await expect(deleteNewsletterEditionWithEpisodes('')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });
  });

  // Original tests for backward compatibility
  maybeDescribe('Original Newsletter Editions Functions', () => {
  const editionDate = '2025-07-04';

  it('insert + getByUserAndDate happy path', async () => {
      const userId = uniqueId('user');
      const newsletterId = uniqueId('newsletter');
    await createTestUser(userId, 'test@example.com');
      testUserId = userId;
      testNewsletterIds.push(newsletterId);

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
      const userId = uniqueId('user');
    await createTestUser(userId, 'test@example.com');
      testUserId = userId;

    // Initial insert
    await insertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Initial</p>'
    });

    // Soft-delete the row to simulate L10 overwrite scenario
      const initialEdition = await getByUserAndDate(userId, editionDate);
      expect(initialEdition).not.toBeNull();
      await softDelete(initialEdition!.id);

    // Upsert with new data – should revive (deleted_at = NULL)
    const upserted = await upsertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Updated content</p>',
      model: 'gemini-1.5-flash'
    });

    expect(upserted.deleted_at).toBeNull();
  });

  it('validation errors: bad date string and empty user_id', async () => {
      const userId = uniqueId('user');
    await createTestUser(userId, 'test@example.com');
      testUserId = userId;

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
      const userId = uniqueId('user');
    await createTestUser(userId, 'test@example.com');
      testUserId = userId;

    const inserted = await insertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated'
    });

    // Soft delete
    await softDelete(inserted.id);

    // Query including deleted should return the soft-deleted row
    const withDeleted = await getByUserAndDate(userId, editionDate, true);
    expect(withDeleted).not.toBeNull();
    });

  it('should save subject_line when provided in upsert', async () => {
    const userId = uniqueId('user');
    await createTestUser(userId, 'test@example.com');
    testUserId = userId;

    // Upsert with subject line
    const upserted = await upsertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Newsletter content</p>',
      model: 'gemini-1.5-flash',
      subject_line: 'AI Ethics, Tech News & Startup Insights'
    });

    expect(upserted.subject_line).toBe('AI Ethics, Tech News & Startup Insights');

    // Verify it persists in database
    const fetched = await getByUserAndDate(userId, editionDate);
    expect(fetched).not.toBeNull();
    expect(fetched!.subject_line).toBe('AI Ethics, Tech News & Startup Insights');
  });

  it('should handle null subject_line in upsert', async () => {
    const userId = uniqueId('user');
    await createTestUser(userId, 'test@example.com');
    testUserId = userId;

    // Upsert without subject line
    const upserted = await upsertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Newsletter content</p>',
      model: 'gemini-1.5-flash'
    });

    expect(upserted.subject_line).toBeNull();

    // Update with subject line
    const updated = await upsertNewsletterEdition({
      user_id: userId,
      edition_date: editionDate,
      status: 'generated',
      content: '<p>Updated content</p>',
      model: 'gemini-1.5-flash',
      subject_line: 'Updated Subject Line'
    });

    expect(updated.subject_line).toBe('Updated Subject Line');
  });
  });
}); 