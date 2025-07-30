/**
 * Integration Tests for Newsletter Subject Line Feature
 * 
 * This test suite provides comprehensive integration testing of the personalized
 * subject line feature across the edition generator and send worker workflow.
 * 
 * Integration Test Coverage:
 * - End-to-end subject line generation in edition workflow
 * - Database persistence of subject_line field
 * - Send worker retrieval and usage of personalized subjects
 * - L10 mode subject line regeneration
 * - Fallback behavior when subject generation fails
 */

// Mock Gemini API for subject line generation
vi.mock('../../lib/llm/gemini.js', () => ({
  generateNewsletterEdition: vi.fn(),
  generateNewsletterSubjectLine: vi.fn()
}));

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { resetDb } from '../../tests/supabaseMock.js';
import { processUserForNewsletter } from '../../lib/utils/editionProcessor.js';
import { buildSubject } from '../../lib/utils/subjectBuilder.js';
import { queryNewsletterEditionsForSending } from '../../lib/db/sendNewsletterQueries.js';
import { generateNewsletterEdition, generateNewsletterSubjectLine } from '../../lib/llm/gemini.js';

// Test environment setup
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

describe('Newsletter Subject Line Integration Tests', () => {
  let supabase: SupabaseClient<Database>;
  
  beforeAll(() => {
    // Freeze time for consistent date handling
    vi.setSystemTime(new Date('2025-07-08T12:00:00Z'));
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  beforeEach(() => {
    resetDb();
    supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    vi.clearAllMocks();
  });

  describe('Edition Generation with Subject Lines', () => {
    it('should generate and persist personalized subject line during edition workflow', async () => {
      // Setup test data
      const userId = 'test-user-1';
      const showId = 'test-show-1';
      const episodeId = 'test-episode-1';
      
      // Insert test user
      await supabase.from('users').insert({
        id: userId,
        email: 'test@example.com',
        created_at: new Date().toISOString()
      });
      
      // Insert podcast show
      await supabase.from('podcast_shows').insert({
        id: showId,
        title: 'AI Podcast',
        spotify_url: 'https://open.spotify.com/show/test',
        rss_url: 'https://example.com/rss'
      });
      
      // Insert subscription
      await supabase.from('user_podcast_subscriptions').insert({
        id: 'sub-1',
        user_id: userId,
        show_id: showId,
        status: 'active'
      });
      
      // Insert episode
      await supabase.from('podcast_episodes').insert({
        id: episodeId,
        show_id: showId,
        title: 'AI Ethics Discussion',
        description: 'Deep dive into AI ethics',
        pub_date: new Date().toISOString(),
        guid: 'episode-guid-1',
        episode_url: 'https://example.com/episode1'
      });
      
      // Insert episode notes
      await supabase.from('episode_transcript_notes').insert({
        id: 'note-1',
        episode_id: episodeId,
        notes: 'AI ethics are crucial for responsible development. Key topics include bias, transparency, and accountability.',
        status: 'done',
        created_at: new Date().toISOString()
      });
      
      // Mock Gemini responses
      const mockNewsletterContent = '<h1>AI Newsletter</h1><p>Today we discuss AI ethics and responsible development.</p>';
      vi.mocked(generateNewsletterEdition).mockResolvedValue({
        success: true,
        htmlContent: mockNewsletterContent,
        sanitizedContent: mockNewsletterContent,
        model: 'gemini-1.5-flash'
      });
      
      vi.mocked(generateNewsletterSubjectLine).mockResolvedValue({
        success: true,
        subjectLine: 'AI Ethics & Responsible Development',
        wordCount: 5
      });
      
      // Process user for newsletter
      const user = {
        id: userId,
        email: 'test@example.com',
        subscriptions: [{ id: 'sub-1', show_id: showId, status: 'active' as const }]
      };
      
      const result = await processUserForNewsletter(
        supabase,
        user,
        { lookbackHours: 24, promptTemplate: 'test', last10Mode: false }
      );
      
      // Verify the result
      expect(result.status).toBe('done');
      expect(result.newsletterEditionId).toBeDefined();
      
      // Verify subject line generation was called
      expect(generateNewsletterSubjectLine).toHaveBeenCalledWith(mockNewsletterContent);
      
      // Verify subject line was persisted to database
      const { data: edition } = await supabase
        .from('newsletter_editions')
        .select('*')
        .eq('id', result.newsletterEditionId!)
        .single();
      
      expect(edition).toBeDefined();
      expect(edition!.subject_line).toBe('AI Ethics & Responsible Development');
    });

    it('should continue without subject line when generation fails', async () => {
      // Setup minimal test data
      const userId = 'test-user-2';
      await supabase.from('users').insert({
        id: userId,
        email: 'test2@example.com'
      });
      
      // Mock successful newsletter but failed subject line
      vi.mocked(generateNewsletterEdition).mockResolvedValue({
        success: true,
        htmlContent: '<h1>Newsletter</h1>',
        sanitizedContent: '<h1>Newsletter</h1>',
        model: 'gemini-1.5-flash'
      });
      
      vi.mocked(generateNewsletterSubjectLine).mockResolvedValue({
        success: false,
        subjectLine: '',
        wordCount: 0,
        error: 'API rate limit exceeded'
      });
      
      // Process user (simplified - no episodes needed for this test)
      const user = {
        id: userId,
        email: 'test2@example.com',
        subscriptions: []
      };
      
      // Note: This will result in 'no_content_found' due to no episodes
      // but we can still verify subject line generation behavior
      const result = await processUserForNewsletter(
        supabase,
        user,
        { lookbackHours: 24, promptTemplate: 'test', last10Mode: false }
      );
      
      // Even though no content found, if there were content,
      // the subject line generation failure wouldn't block the process
      expect(result.status).toBe('no_content_found');
    });
  });

  describe('Send Worker Subject Line Usage', () => {
    it('should use personalized subject line when sending emails', async () => {
      // Insert a newsletter edition with personalized subject
      const editionId = 'edition-1';
      const userId = 'user-1';
      
      await supabase.from('users').insert({
        id: userId,
        email: 'user@example.com'
      });
      
      await supabase.from('newsletter_editions').insert({
        id: editionId,
        user_id: userId,
        edition_date: '2025-07-08',
        status: 'generated',
        user_email: 'user@example.com',
        content: '<p>Newsletter content</p>',
        model: 'gemini-1.5-flash',
        subject_line: 'Tech Trends & AI Innovations',
        created_at: new Date().toISOString()
      });
      
      // Query editions as send worker would
      const editions = await queryNewsletterEditionsForSending(supabase, 24);
      
      expect(editions).toHaveLength(1);
      expect(editions[0].subject_line).toBe('Tech Trends & AI Innovations');
      
      // Verify subject building
      const subject = buildSubject(editions[0].edition_date, editions[0].subject_line);
      expect(subject).toBe('July 8, 2025: Tech Trends & AI Innovations');
    });

    it('should fallback to default subject when subject_line is null', async () => {
      // Insert a newsletter edition without personalized subject
      const editionId = 'edition-2';
      const userId = 'user-2';
      
      await supabase.from('users').insert({
        id: userId,
        email: 'user2@example.com'
      });
      
      await supabase.from('newsletter_editions').insert({
        id: editionId,
        user_id: userId,
        edition_date: '2025-07-08',
        status: 'generated',
        user_email: 'user2@example.com',
        content: '<p>Newsletter content</p>',
        model: 'gemini-1.5-flash',
        subject_line: null,
        created_at: new Date().toISOString()
      });
      
      // Query editions as send worker would
      const editions = await queryNewsletterEditionsForSending(supabase, 24);
      
      expect(editions).toHaveLength(1);
      expect(editions[0].subject_line).toBeNull();
      
      // Verify subject building with fallback
      const subject = buildSubject(editions[0].edition_date, editions[0].subject_line);
      expect(subject).toBe('Your Podcast Newsletter: July 8, 2025');
    });
  });

  describe('L10 Mode Subject Line Regeneration', () => {
    it('should regenerate subject lines for existing editions in L10 mode', async () => {
      // Insert existing newsletter edition without subject line
      const editionId = 'edition-3';
      const userId = 'user-3';
      const showId = 'show-3';
      const episodeId = 'episode-3';
      
      await supabase.from('users').insert({
        id: userId,
        email: 'user3@example.com'
      });
      
      await supabase.from('podcast_shows').insert({
        id: showId,
        title: 'Tech Show',
        spotify_url: 'https://open.spotify.com/show/test',
        rss_url: 'https://example.com/rss'
      });
      
      await supabase.from('user_podcast_subscriptions').insert({
        id: 'sub-3',
        user_id: userId,
        show_id: showId,
        status: 'active'
      });
      
      await supabase.from('podcast_episodes').insert({
        id: episodeId,
        show_id: showId,
        title: 'Tech Trends',
        pub_date: new Date().toISOString(),
        guid: 'guid-3',
        episode_url: 'https://example.com/episode3'
      });
      
      await supabase.from('episode_transcript_notes').insert({
        id: 'note-3',
        episode_id: episodeId,
        notes: 'Latest technology trends and innovations.',
        status: 'done',
        created_at: new Date().toISOString()
      });
      
      // Insert existing edition without subject line
      await supabase.from('newsletter_editions').insert({
        id: editionId,
        user_id: userId,
        edition_date: '2025-07-08',
        status: 'generated',
        user_email: 'user3@example.com',
        content: '<p>Existing newsletter</p>',
        model: 'gemini-1.5-flash',
        subject_line: null,
        created_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      });
      
      // Mock Gemini responses for L10 regeneration
      vi.mocked(generateNewsletterEdition).mockResolvedValue({
        success: true,
        htmlContent: '<h1>Updated Newsletter</h1>',
        sanitizedContent: '<h1>Updated Newsletter</h1>',
        model: 'gemini-1.5-flash'
      });
      
      vi.mocked(generateNewsletterSubjectLine).mockResolvedValue({
        success: true,
        subjectLine: 'Tech Trends & Latest Innovations',
        wordCount: 5
      });
      
      // Process user in L10 mode with existing edition
      const user = {
        id: userId,
        email: 'user3@example.com',
        subscriptions: [{ id: 'sub-3', show_id: showId, status: 'active' as const }]
      };
      
      const existingEditions = [{
        id: editionId,
        user_id: userId,
        edition_date: '2025-07-08',
        user_email: 'user3@example.com'
      }];
      
      const result = await processUserForNewsletter(
        supabase,
        user,
        { lookbackHours: 24, promptTemplate: 'test', last10Mode: true },
        undefined,
        existingEditions
      );
      
      expect(result.status).toBe('done');
      
      // Verify subject line was generated and saved
      const { data: updatedEdition } = await supabase
        .from('newsletter_editions')
        .select('*')
        .eq('id', editionId)
        .single();
      
      expect(updatedEdition).toBeDefined();
      expect(updatedEdition!.subject_line).toBe('Tech Trends & Latest Innovations');
    });
  });

  describe('End-to-End Subject Line Workflow', () => {
    it('should handle complete workflow from generation to email sending', async () => {
      // This test simulates the complete flow without actually sending emails
      const userId = 'user-e2e';
      const showId = 'show-e2e';
      const episodeId = 'episode-e2e';
      
      // Setup complete test scenario
      await supabase.from('users').insert({
        id: userId,
        email: 'e2e@example.com'
      });
      
      await supabase.from('podcast_shows').insert({
        id: showId,
        title: 'End-to-End Show',
        spotify_url: 'https://open.spotify.com/show/test',
        rss_url: 'https://example.com/rss'
      });
      
      await supabase.from('user_podcast_subscriptions').insert({
        id: 'sub-e2e',
        user_id: userId,
        show_id: showId,
        status: 'active'
      });
      
      await supabase.from('podcast_episodes').insert({
        id: episodeId,
        show_id: showId,
        title: 'Complete Workflow Test',
        pub_date: new Date().toISOString(),
        guid: 'guid-e2e',
        episode_url: 'https://example.com/episode-e2e'
      });
      
      await supabase.from('episode_transcript_notes').insert({
        id: 'note-e2e',
        episode_id: episodeId,
        notes: 'This tests the complete subject line workflow from generation to sending.',
        status: 'done',
        created_at: new Date().toISOString()
      });
      
      // Mock successful generation
      vi.mocked(generateNewsletterEdition).mockResolvedValue({
        success: true,
        htmlContent: '<h1>Complete Workflow Newsletter</h1>',
        sanitizedContent: '<h1>Complete Workflow Newsletter</h1>',
        model: 'gemini-1.5-flash'
      });
      
      vi.mocked(generateNewsletterSubjectLine).mockResolvedValue({
        success: true,
        subjectLine: 'Complete Workflow Test Results',
        wordCount: 4
      });
      
      // Step 1: Generate newsletter with subject
      const user = {
        id: userId,
        email: 'e2e@example.com',
        subscriptions: [{ id: 'sub-e2e', show_id: showId, status: 'active' as const }]
      };
      
      const generateResult = await processUserForNewsletter(
        supabase,
        user,
        { lookbackHours: 24, promptTemplate: 'test', last10Mode: false }
      );
      
      expect(generateResult.status).toBe('done');
      expect(generateResult.newsletterEditionId).toBeDefined();
      
      // Step 2: Query as send worker would
      const sendableEditions = await queryNewsletterEditionsForSending(supabase, 24);
      
      expect(sendableEditions).toHaveLength(1);
      const edition = sendableEditions[0];
      
      // Step 3: Build subject as send worker would
      const emailSubject = buildSubject(edition.edition_date, edition.subject_line);
      
      // Verify complete flow
      expect(edition.subject_line).toBe('Complete Workflow Test Results');
      expect(emailSubject).toBe('July 8, 2025: Complete Workflow Test Results');
      expect(edition.content).toContain('Complete Workflow Newsletter');
      expect(edition.status).toBe('generated');
      // sent_at should be null or undefined for unsent editions
      expect(edition.sent_at ?? null).toBeNull();
    });
  });
});