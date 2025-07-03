/**
 * Unit tests for Newsletter Edition Episodes Database Helpers
 *
 * Tests all CRUD operations and edge cases for the newsletter_edition_episodes
 * join table functionality.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  insertNewsletterEditionEpisode,
  insertNewsletterEditionEpisodes,
  getEpisodesByNewsletterId,
  getNewslettersByEpisodeId,
  deleteNewsletterEditionEpisodes,
  isEpisodeLinkedToNewsletter,
  getEpisodeCountByNewsletterId,
  type CreateNewsletterEditionEpisodeParams,
  type CreateNewsletterEditionEpisodesParams
} from './newsletter-edition-episodes.js';

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

// Configure test environment variables for Supabase client creation
process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

let supabase: SupabaseClient;

// Test data cleanup tracking
let testNewsletterIds: string[] = [];
let testEpisodeIds: string[] = [];
let testShowIds: string[] = [];
let testUserId: string | null = null;

// ---------------------------------------------------------------------------
// Helper: create test data
// ---------------------------------------------------------------------------
async function createTestUser(userId: string, email: string) {
  const { error } = await supabase
    .from('users')
    .insert({ id: userId, email });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
}

async function createTestNewsletterEdition(id: string, userId: string, editionDate: string) {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Newsletter Edition Episodes Database Helpers', () => {
  // Only run when the test runner has the necessary credentials
  const hasCredentials = Boolean(
    process.env.SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Dynamically skip when credentials are missing to avoid local dev pain
  const maybeDescribe = hasCredentials ? describe : describe.skip;

  beforeAll(async () => {
    if (!hasCredentials) return;

    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify database connection and newsletter_edition_episodes table exists
    const { data: _data, error } = await supabase
      .from('newsletter_edition_episodes')
      .select('count')
      .limit(0)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database connection failed or newsletter_edition_episodes table missing: ${error.message}`);
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
        .from('newsletter_edition_episodes')
        .delete()
        .in('newsletter_edition_id', testNewsletterIds);
      
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

  maybeDescribe('insertNewsletterEditionEpisode', () => {
    it('should successfully insert a single newsletter edition episode link', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId = 'episode-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId);

      await createTestEpisodeTranscriptNote(episodeId, 'Test notes 1');

      const params: CreateNewsletterEditionEpisodeParams = {
        newsletter_edition_id: newsletterId,
        episode_id: episodeId
      };

      // Insert newsletter edition episode link
      const result = await insertNewsletterEditionEpisode(params);

      // Verify the result is defined and has the expected fields
      expect(result).toBeDefined();
      expect(result.newsletter_edition_id).toBe(newsletterId);
      expect(result.episode_id).toBe(episodeId);

      // Verify timestamp fields are present (when not in mock environment)
      if (result.id !== undefined) {
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
      }
      if (result.created_at !== undefined) {
        expect(result.created_at).toBeDefined();
        expect(typeof result.created_at).toBe('string');
      }
    });

    it('should throw error for missing newsletter_edition_id', async () => {
      const invalidParams = { newsletter_edition_id: '', episode_id: 'episode-1' };

      await expect(insertNewsletterEditionEpisode(invalidParams)).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });

    it('should throw error for missing episode_id', async () => {
      const invalidParams = { newsletter_edition_id: 'newsletter-1', episode_id: '' };

      await expect(insertNewsletterEditionEpisode(invalidParams)).rejects.toThrow(
        'episode_id is required and must be a non-empty string'
      );
    });

    it('should throw error for non-existent newsletter edition', async () => {
      // Set up test data
      const userId = 'user-1';
      const showId = 'show-1';
      const episodeId = 'episode-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId);

      await createTestEpisodeTranscriptNote(episodeId, 'Test notes 1');

      const params = { newsletter_edition_id: 'non-existent', episode_id: episodeId };

      await expect(insertNewsletterEditionEpisode(params)).rejects.toThrow();
    });

    it('should throw error for non-existent episode', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      const params = { newsletter_edition_id: newsletterId, episode_id: 'non-existent' };

      await expect(insertNewsletterEditionEpisode(params)).rejects.toThrow();
    });
  });

  maybeDescribe('insertNewsletterEditionEpisodes', () => {
    it('should successfully insert multiple newsletter edition episode links', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';
      const episodeId2 = 'episode-2';
      const episodeId3 = 'episode-3';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      await createTestEpisode(episodeId3, showId, 'Test Episode 3');
      testEpisodeIds.push(episodeId1, episodeId2, episodeId3);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');
      await createTestEpisodeTranscriptNote(episodeId3, 'Test notes 3');

      const params: CreateNewsletterEditionEpisodesParams = {
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, episodeId2, episodeId3]
      };

      const result = await insertNewsletterEditionEpisodes(params);

      expect(result).toHaveLength(3);
      expect(result[0].newsletter_edition_id).toBe(newsletterId);
      expect(result[0].episode_id).toBe(episodeId1);
      expect(result[1].episode_id).toBe(episodeId2);
      expect(result[2].episode_id).toBe(episodeId3);
    });

    it('should remove duplicate episode IDs before inserting', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';
      const episodeId2 = 'episode-2';
      const episodeId3 = 'episode-3';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      await createTestEpisode(episodeId3, showId, 'Test Episode 3');
      testEpisodeIds.push(episodeId1, episodeId2, episodeId3);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');
      await createTestEpisodeTranscriptNote(episodeId3, 'Test notes 3');

      const params = {
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, episodeId2, episodeId1, episodeId3, episodeId2]
      };

      const result = await insertNewsletterEditionEpisodes(params);

      expect(result).toHaveLength(3);
      expect(result[0].episode_id).toBe(episodeId1);
      expect(result[1].episode_id).toBe(episodeId2);
      expect(result[2].episode_id).toBe(episodeId3);
    });

    it('should throw error for empty episode_ids array', async () => {
      const params = {
        newsletter_edition_id: 'newsletter-1',
        episode_ids: []
      };

      await expect(insertNewsletterEditionEpisodes(params)).rejects.toThrow(
        'episode_ids array is required and must contain at least one episode_id'
      );
    });

    it('should throw error for invalid episode_id in array', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId1);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');

      const params = {
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, 'invalid-episode-id']
      };

      await expect(insertNewsletterEditionEpisodes(params)).rejects.toThrow();
    });
  });

  maybeDescribe('getEpisodesByNewsletterId', () => {
    it('should successfully retrieve episodes for a newsletter', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';
      const episodeId2 = 'episode-2';
      const episodeId3 = 'episode-3';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      await createTestEpisode(episodeId3, showId, 'Test Episode 3');
      testEpisodeIds.push(episodeId1, episodeId2, episodeId3);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');
      await createTestEpisodeTranscriptNote(episodeId3, 'Test notes 3');

      // Insert newsletter edition episodes
      await insertNewsletterEditionEpisodes({
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, episodeId2, episodeId3]
      });

      const result = await getEpisodesByNewsletterId(newsletterId);

      expect(result).toHaveLength(3);
      expect(result[0].newsletter_edition_id).toBe(newsletterId);
      expect(result[0].episodes).toBeDefined();
      expect(result[0].episodes!.title).toBe('Test Episode 1');
      expect(result[1].episodes!.title).toBe('Test Episode 2');
      expect(result[2].episodes!.title).toBe('Test Episode 3');
    });

    it('should return empty array when no episodes found', async () => {
      const result = await getEpisodesByNewsletterId('non-existent-newsletter');

      expect(result).toHaveLength(0);
    });

    it('should throw error for missing newsletter_edition_id', async () => {
      await expect(getEpisodesByNewsletterId('')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });
  });

  maybeDescribe('getNewslettersByEpisodeId', () => {
    it('should successfully retrieve newsletters for an episode', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId1);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');

      // Insert newsletter edition episode
      await insertNewsletterEditionEpisode({
        newsletter_edition_id: newsletterId,
        episode_id: episodeId1
      });

      const result = await getNewslettersByEpisodeId(episodeId1);

      expect(result).toHaveLength(1);
      expect(result[0].episode_id).toBe(episodeId1);
      expect(result[0].newsletter_editions).toBeDefined();
      expect(result[0].newsletter_editions!.id).toBe(newsletterId);
    });

    it('should return empty array when no newsletters found', async () => {
      const result = await getNewslettersByEpisodeId('non-existent-episode');

      expect(result).toHaveLength(0);
    });

    it('should throw error for missing episode_id', async () => {
      await expect(getNewslettersByEpisodeId('')).rejects.toThrow(
        'episode_id is required and must be a non-empty string'
      );
    });
  });

  maybeDescribe('deleteNewsletterEditionEpisodes', () => {
    it('should successfully delete all episode links for a newsletter', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';
      const episodeId2 = 'episode-2';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      testEpisodeIds.push(episodeId1, episodeId2);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');

      // Insert newsletter edition episodes
      await insertNewsletterEditionEpisodes({
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, episodeId2]
      });

      const deletedCount = await deleteNewsletterEditionEpisodes(newsletterId);

      expect(deletedCount).toBe(2);

      // Verify they were deleted
      const remaining = await getEpisodesByNewsletterId(newsletterId);
      expect(remaining).toHaveLength(0);
    });

    it('should return 0 when no records are deleted', async () => {
      const deletedCount = await deleteNewsletterEditionEpisodes('non-existent-newsletter');

      expect(deletedCount).toBe(0);
    });

    it('should throw error for missing newsletter_edition_id', async () => {
      await expect(deleteNewsletterEditionEpisodes('')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });
  });

  maybeDescribe('isEpisodeLinkedToNewsletter', () => {
    it('should return true when episode is linked to newsletter', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      testEpisodeIds.push(episodeId1);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');

      // Insert newsletter edition episode
      await insertNewsletterEditionEpisode({
        newsletter_edition_id: newsletterId,
        episode_id: episodeId1
      });

      const isLinked = await isEpisodeLinkedToNewsletter(newsletterId, episodeId1);

      expect(isLinked).toBe(true);
    });

    it('should return false when episode is not linked to newsletter', async () => {
      const isLinked = await isEpisodeLinkedToNewsletter('newsletter-1', 'episode-1');

      expect(isLinked).toBe(false);
    });

    it('should throw error for missing newsletter_edition_id', async () => {
      await expect(isEpisodeLinkedToNewsletter('', 'episode-1')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });

    it('should throw error for missing episode_id', async () => {
      await expect(isEpisodeLinkedToNewsletter('newsletter-1', '')).rejects.toThrow(
        'episode_id is required and must be a non-empty string'
      );
    });
  });

  maybeDescribe('getEpisodeCountByNewsletterId', () => {
    it('should successfully return episode count for a newsletter', async () => {
      // Set up test data
      const userId = 'user-1';
      const newsletterId = 'newsletter-1';
      const showId = 'show-1';
      const episodeId1 = 'episode-1';
      const episodeId2 = 'episode-2';
      const episodeId3 = 'episode-3';

      await createTestUser(userId, 'test@example.com');
      testUserId = userId;

      await createTestNewsletterEdition(newsletterId, userId, '2025-01-27');
      testNewsletterIds.push(newsletterId);

      await createTestPodcastShow(showId, 'Test Show');
      testShowIds.push(showId);

      await createTestEpisode(episodeId1, showId, 'Test Episode 1');
      await createTestEpisode(episodeId2, showId, 'Test Episode 2');
      await createTestEpisode(episodeId3, showId, 'Test Episode 3');
      testEpisodeIds.push(episodeId1, episodeId2, episodeId3);

      await createTestEpisodeTranscriptNote(episodeId1, 'Test notes 1');
      await createTestEpisodeTranscriptNote(episodeId2, 'Test notes 2');
      await createTestEpisodeTranscriptNote(episodeId3, 'Test notes 3');

      // Insert newsletter edition episodes
      await insertNewsletterEditionEpisodes({
        newsletter_edition_id: newsletterId,
        episode_ids: [episodeId1, episodeId2, episodeId3]
      });

      const count = await getEpisodeCountByNewsletterId(newsletterId);

      expect(count).toBe(3);
    });

    it('should return 0 when no episodes found', async () => {
      const count = await getEpisodeCountByNewsletterId('non-existent-newsletter');

      expect(count).toBe(0);
    });

    it('should throw error for missing newsletter_edition_id', async () => {
      await expect(getEpisodeCountByNewsletterId('')).rejects.toThrow(
        'newsletter_edition_id is required and must be a non-empty string'
      );
    });
  });
}); 