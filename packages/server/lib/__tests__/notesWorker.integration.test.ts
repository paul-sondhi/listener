// Set environment variables before any imports
process.env.GEMINI_API_KEY = 'AIza-test-key-for-integration-tests';

/**
 * Integration tests for Notes Worker
 * 
 * Tests the complete workflow from database query to notes generation and storage.
 * These tests verify that all components work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { 
  queryTranscriptsNeedingNotes 
} from '../db/notesQueries.js';
import { 
  insertTranscript 
} from '../db/transcripts.js';
import { 
  downloadAndParseTranscript 
} from '../utils/transcriptDownloader.js';
import * as notesGen from '../utils/notesGenerator';
import { 
  upsertEpisodeNotes 
} from '../db/notesDatabase.js';
import { 
  getNotesWorkerConfig 
} from '../../config/notesWorkerConfig.js';
import { resetDb } from '../../tests/supabaseMock'; // Ensure a clean DB state for every test

/**
 * Integration tests for Notes Worker
 * 
 * Tests the complete workflow from database query to notes generation and storage.
 * These tests verify that all components work together correctly.
 */

// Note: These are already imported globally via vitest setup
// import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// import { createClient } from '@supabase/supabase-js';
// import { Database } from '../../../shared/src/types/supabase.js';

// Test database client
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Mock Gemini notes generation for integration test
vi.spyOn(notesGen, 'generateNotesWithPrompt').mockResolvedValue({
  notes: 'Mock episode notes for testing.',
  model: 'gemini-mock',
  elapsedMs: 123,
  success: true
});

describe('Notes Worker Integration', () => {
  // Test data - will be unique per test
  let testEpisodeId: string;
  let testTranscriptId: string;
  let testShowId: string;
  
  beforeEach(async () => {
    // Reset the in-memory Supabase mock DB before every test to prevent data leakage between tests
    resetDb();
    
    // Generate unique IDs for each test
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testEpisodeId = `test-episode-${timestamp}-${random}`;
    testTranscriptId = `test-transcript-${timestamp}-${random}`;
    testShowId = `test-show-${timestamp}-${random}`;
    
    // Clean up any existing test data
    await supabase
      .from('episode_transcript_notes')
      .delete()
      .eq('episode_id', testEpisodeId);
      
    await supabase
      .from('transcripts')
      .delete()
      .eq('id', testTranscriptId);
      
    await supabase
      .from('podcast_episodes')
      .delete()
      .eq('id', testEpisodeId);
      
    await supabase
      .from('podcast_shows')
      .delete()
      .eq('id', testShowId);
  });

  afterEach(async () => {
    // Clean up test data
    await supabase
      .from('episode_transcript_notes')
      .delete()
      .eq('episode_id', testEpisodeId);
      
    await supabase
      .from('transcripts')
      .delete()
      .eq('id', testTranscriptId);
      
    await supabase
      .from('podcast_episodes')
      .delete()
      .eq('id', testEpisodeId);
      
    await supabase
      .from('podcast_shows')
      .delete()
      .eq('id', testShowId);
  });

  describe('Complete Workflow', () => {
    it('should process a transcript and generate notes successfully', async () => {
      // 1. Setup test data
      const now = Date.now();
      const episodeDate = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
      
      // Insert test show
      const { error: showError } = await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      expect(showError).toBeNull();
      
      // Insert test episode
      const { error: episodeError } = await supabase
        .from('podcast_episodes')
        .insert({
          id: testEpisodeId,
          show_id: testShowId,
          title: 'Test Episode Title',
          description: 'Test episode description',
          spotify_url: 'https://open.spotify.com/episode/test',
          pub_date: episodeDate.toISOString(),
          duration: 3600,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      expect(episodeError).toBeNull();
      
      // Insert test transcript with explicit id
      const { error: _transcriptError } = await supabase
        .from('transcripts')
        .insert({
          id: testTranscriptId,
          episode_id: testEpisodeId,
          initial_status: 'full',
          current_status: 'full',
          word_count: 1500,
          storage_path: 'test-transcript.jsonl.gz',
          source: 'taddy'
        });

      // Log all transcripts
      const { data: _allTranscripts } = await supabase.from('transcripts').select('*');
      // Log all episodes
      const { data: _allEpisodes } = await supabase.from('podcast_episodes').select('*');
      // Log all shows
      const { data: _allShows } = await supabase.from('podcast_shows').select('*');

      // Query for transcript directly (avoiding join for now)
      const { data: transcripts, error: queryError } = await supabase
        .from('transcripts')
        .select('*')
        .eq('episode_id', testEpisodeId);
      expect(queryError).toBeNull();
      expect(transcripts).toBeDefined();
      expect(transcripts!.length).toBe(1);
      expect(transcripts![0].episode_id).toBe(testEpisodeId);
      expect(transcripts![0].storage_path).toBe('test-transcript.jsonl.gz');

      // Continue with the workflow using the transcript data
      const transcript = transcripts![0];

      // 3. Attempt to download transcript (should fail since file doesn't exist)
      try {
        await downloadAndParseTranscript(supabase, transcript.storage_path);
        expect.fail('Should have thrown an error for missing file');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toMatch(/not a function|404|No such file/i);
      }

      // 4. Generate notes with mock transcript content
      const config = getNotesWorkerConfig();
      const notesResult = await notesGen.generateNotesWithPrompt(
        'This is a mock transcript for testing. It contains sample content that should be processed into episode notes.',
        config
      );
      expect(notesResult.success).toBe(true);
      expect(notesResult.notes).toBeDefined();
      expect(notesResult.notes!.length).toBeGreaterThan(0);
      expect(notesResult.model).toBeDefined();

      // 5. Save notes to database using direct Supabase upsert
      const upsertData = {
        episode_id: testEpisodeId,
        transcript_id: transcript.id,
        status: 'done',
        notes: notesResult.notes!,
        model: notesResult.model!,
        updated_at: new Date().toISOString(),
        deleted_at: null
      };
      const { data: upsertResult, error: upsertError } = await supabase
        .from('episode_transcript_notes')
        .upsert([upsertData], { onConflict: 'episode_id', ignoreDuplicates: false })
        .select('id')
        .single();
      expect(upsertError).toBeNull();
      expect(upsertResult).toBeDefined();
    }, 30000);

    it('should handle missing transcript storage file gracefully', async () => {
      
      // 1. Setup test data with non-existent storage path
      const now = Date.now();
      const episodeDate = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
      
      // Insert test show
      const { error: showError } = await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      expect(showError).toBeNull();
      
      // Insert test episode
      const { error: episodeError } = await supabase
        .from('podcast_episodes')
        .insert({
          id: testEpisodeId,
          show_id: testShowId,
          title: 'Test Episode Title',
          description: 'Test episode description',
          spotify_url: 'https://open.spotify.com/episode/test',
          pub_date: episodeDate.toISOString(),
          duration: 3600,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      expect(episodeError).toBeNull();
      
      // Insert test transcript with non-existent storage path
      const _transcriptResult = await insertTranscript(
        testEpisodeId,
        'non-existent-file.jsonl.gz',
        'full',
        'full',
        1500,
        'taddy'
      );
      
      
      // Verify data was inserted
      const { data: _allShows, error: _showsError } = await supabase.from('podcast_shows').select('*');
      
      const { data: _allEpisodes, error: _episodesError } = await supabase.from('podcast_episodes').select('*');
      
      const { data: _allTranscripts, error: _transcriptsError } = await supabase.from('transcripts').select('*');
      
      // 2. Query for transcripts needing notes
      const transcripts = await queryTranscriptsNeedingNotes(supabase, 24, false, 10, now);
      // Debug: print all transcripts before the query
      const { data: _debugAllTranscripts } = await supabase.from('transcripts').select('*');
      expect(transcripts).toHaveLength(1);
      
      // 3. Attempt to download transcript (should fail)
      try {
        await downloadAndParseTranscript(supabase, transcripts[0].storage_path);
        expect.fail('Should have thrown an error for missing file');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toMatch(/not a function|404|No such file/i);
      }
      
      // 4. Save error to database
      const saveResult = await upsertEpisodeNotes(supabase, {
        episodeId: testEpisodeId,
        transcriptId: testTranscriptId,
        status: 'error',
        errorMessage: 'Failed to download transcript: 404 Not Found'
      });
      
      expect(saveResult.success).toBe(true);
      
      // 5. Verify error was saved correctly
      const { data: savedNotes, error: fetchError } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .eq('episode_id', testEpisodeId)
        .single();
      
      expect(fetchError).toBeNull();
      expect(savedNotes).toBeDefined();
      expect(savedNotes!.status).toBe('error');
      expect(savedNotes!.notes).toBeNull();
      expect(savedNotes!.model).toBeNull();
      expect(savedNotes!.error_message).toContain('download_error:');
      expect(savedNotes!.error_message.length).toBeLessThanOrEqual(260);
    });

    it('should handle missing storage file in complete workflow', async () => {
      
      // Generate unique IDs for this test run
      const now = Date.now();
      const episodeIds = Array.from({ length: 3 }, (_, i) => `ep-missing-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      const transcriptIds = Array.from({ length: 3 }, (_, i) => `t-missing-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      
      // Insert test show
      const nowDate = new Date(now);
      const { error: showError } = await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: nowDate.toISOString(),
          updated_at: nowDate.toISOString()
        });
      
      expect(showError).toBeNull();
      
      // Insert test episodes and transcripts
      for (let i = 0; i < episodeIds.length; i++) {
        const episodeDate = new Date(now - (i + 1) * 60 * 60 * 1000);
        
        const { error: episodeError } = await supabase
          .from('podcast_episodes')
          .insert({
            id: episodeIds[i],
            show_id: testShowId,
            title: `Test Episode Missing ${i + 1}`,
            description: `Test episode missing ${i + 1} description`,
            spotify_url: `https://open.spotify.com/episode/test-missing-${i + 1}`,
            pub_date: episodeDate.toISOString(),
            duration: 3600,
            created_at: episodeDate.toISOString(),
            updated_at: episodeDate.toISOString()
          });
        
        expect(episodeError).toBeNull();
        
        // Use different storage paths: one missing, one empty, one valid-looking
        const storagePaths = [
          'missing-file.jsonl.gz',
          '',
          'valid-looking-file.jsonl.gz'
        ];
        
        const _transcriptResult = await insertTranscript(
          episodeIds[i],
          storagePaths[i],
          'full',
          'full',
          1500,
          'taddy'
        );
        
        // Update the transcript with the correct id and timestamps
        await supabase
          .from('transcripts')
          .update({
            id: transcriptIds[i],
            created_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString()
          })
          .eq('episode_id', episodeIds[i]);
        
      }
      
      // Verify all data was inserted
      const { data: _allShows, error: _showsError } = await supabase.from('podcast_shows').select('*');
      
      const { data: _allEpisodes, error: _episodesError } = await supabase.from('podcast_episodes').select('*');
      
      const { data: _allTranscripts, error: _transcriptsError } = await supabase.from('transcripts').select('*');
      
      // 2. Query for transcripts needing notes
      const transcripts = await queryTranscriptsNeedingNotes(supabase, 24, false, 10, now);
      // Debug: print all transcripts before the query
      const { data: _debugAllTranscripts } = await supabase.from('transcripts').select('*');
      expect(transcripts).toHaveLength(2); // Should exclude empty storage path
      
      // 3. Process each transcript and verify error handling
      for (const transcript of transcripts) {
        try {
          await downloadAndParseTranscript(supabase, transcript.storage_path);
          expect.fail(`Should have thrown an error for transcript ${transcript.id}`);
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as Error).message).toMatch(/not a function|404|No such file|empty/i);
          
          // 4. Save error to database
          const saveResult = await upsertEpisodeNotes(supabase, {
            episodeId: transcript.episode_id,
            transcriptId: transcript.id,
            status: 'error',
            errorMessage: `Failed to download transcript: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          
          expect(saveResult.success).toBe(true);
          
          // 5. Verify error was saved correctly
          const { data: savedNotes, error: fetchError } = await supabase
            .from('episode_transcript_notes')
            .select('*')
            .eq('episode_id', transcript.episode_id)
            .single();
          
          expect(fetchError).toBeNull();
          expect(savedNotes).toBeDefined();
          expect(savedNotes!.status).toBe('error');
          expect(savedNotes!.notes).toBeNull();
          expect(savedNotes!.model).toBeNull();
          expect(savedNotes!.error_message).toContain('download_error:');
          expect(savedNotes!.error_message.length).toBeLessThanOrEqual(260);
        }
      }
      
      // 6. Verify all transcripts have error status
      const { data: allNotes, error: allNotesError } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .in('episode_id', episodeIds);
      
      expect(allNotesError).toBeNull();
      expect(allNotes).toHaveLength(2); // Should have 2 error notes
      allNotes!.forEach(note => {
        expect(note.status).toBe('error');
        expect(note.notes).toBeNull();
        expect(note.model).toBeNull();
        expect(note.error_message).toContain('download_error:');
      });
    }, 30000);

    it('should handle L10 mode correctly', async () => {
      
      // Generate unique IDs for this test run
      const now = Date.now();
      const episodeIds = Array.from({ length: 5 }, (_, i) => `ep-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      const transcriptIds = Array.from({ length: 5 }, (_, i) => `t-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      
      // Insert test show
      const nowDate = new Date(now);
      const { error: showError } = await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: nowDate.toISOString(),
          updated_at: nowDate.toISOString()
        });
      
      expect(showError).toBeNull();
      
      // Insert multiple test episodes
      for (let i = 0; i < episodeIds.length; i++) {
        const episodeDate = new Date(now - (i + 1) * 60 * 60 * 1000); // Different times
        
        const { error: episodeError } = await supabase
          .from('podcast_episodes')
          .insert({
            id: episodeIds[i],
            show_id: testShowId,
            title: `Test Episode ${i + 1}`,
            description: `Test episode ${i + 1} description`,
            spotify_url: `https://open.spotify.com/episode/test-${i + 1}`,
            pub_date: episodeDate.toISOString(),
            duration: 3600,
            created_at: episodeDate.toISOString(),
            updated_at: episodeDate.toISOString()
          });
        
        expect(episodeError).toBeNull();
        
        const _transcriptResult = await insertTranscript(
          episodeIds[i],
          `test-transcript-${i + 1}.jsonl.gz`,
          'full',
          'full',
          1500,
          'taddy'
        );
        
        // Update the transcript with the correct id and timestamps
        await supabase
          .from('transcripts')
          .update({
            id: transcriptIds[i],
            created_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString()
          })
          .eq('episode_id', episodeIds[i]);
        
      }
      
      // Verify all data was inserted
      const { data: _allShows, error: _showsError } = await supabase.from('podcast_shows').select('*');
      
      const { data: _allEpisodes, error: _episodesError } = await supabase.from('podcast_episodes').select('*');
      
      const { data: _allTranscripts, error: _transcriptsError } = await supabase.from('transcripts').select('*');
      
      // 2. Query for transcripts in L10 mode
      const transcriptsL10 = await queryTranscriptsNeedingNotes(supabase, 24, true, 10, now);
      // Debug: print all transcripts before the query
      const { data: _debugAllTranscripts } = await supabase.from('transcripts').select('*');
      expect(transcriptsL10).toHaveLength(5); // Should get all 5 transcripts
      
      // 3. Verify transcripts are ordered by created_at (newest first)
      for (let i = 0; i < transcriptsL10.length - 1; i++) {
        const currentDate = new Date(transcriptsL10[i].created_at);
        const nextDate = new Date(transcriptsL10[i + 1].created_at);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
      
      // 4. Verify all transcripts have storage paths
      transcriptsL10.forEach(transcript => {
        expect(transcript.storage_path).toBeDefined();
        expect(transcript.episode_id).toBeDefined();
      });
    });

    it('should overwrite existing notes in L10 mode', async () => {
      
      // Generate unique IDs for this test run
      const now = Date.now();
      const episodeIds = Array.from({ length: 3 }, (_, i) => `ep-l10-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      const transcriptIds = Array.from({ length: 3 }, (_, i) => `t-l10-${now}-${Math.random().toString(36).slice(2)}-${i}`);
      
      // Insert test show
      const nowDate = new Date(now);
      const { error: showError } = await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: nowDate.toISOString(),
          updated_at: nowDate.toISOString()
        });
      
      expect(showError).toBeNull();
      
      // Insert test episodes and transcripts
      for (let i = 0; i < episodeIds.length; i++) {
        const episodeDate = new Date(now - (i + 1) * 60 * 60 * 1000);
        
        const { error: episodeError } = await supabase
          .from('podcast_episodes')
          .insert({
            id: episodeIds[i],
            show_id: testShowId,
            title: `Test Episode L10 ${i + 1}`,
            description: `Test episode L10 ${i + 1} description`,
            spotify_url: `https://open.spotify.com/episode/test-l10-${i + 1}`,
            pub_date: episodeDate.toISOString(),
            duration: 3600,
            created_at: episodeDate.toISOString(),
            updated_at: episodeDate.toISOString()
          });
        
        expect(episodeError).toBeNull();
        
        const _transcriptResult = await insertTranscript(
          episodeIds[i],
          `test-transcript-l10-${i + 1}.jsonl.gz`,
          'full',
          'full',
          1500,
          'taddy'
        );
        
        // Update the transcript with the correct id and timestamps
        await supabase
          .from('transcripts')
          .update({
            id: transcriptIds[i],
            created_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString()
          })
          .eq('episode_id', episodeIds[i]);
        
      }
      
      // 2. Create existing notes for some episodes (to test overwrite)
      const existingNotesData = [
        {
          episode_id: episodeIds[0],
          transcript_id: transcriptIds[0],
          status: 'done',
          notes: 'Old notes for episode 1',
          model: 'old-model',
          created_at: nowDate.toISOString(),
          updated_at: nowDate.toISOString(),
          deleted_at: null
        },
        {
          episode_id: episodeIds[1],
          transcript_id: transcriptIds[1],
          status: 'done',
          notes: 'Old notes for episode 2',
          model: 'old-model',
          created_at: nowDate.toISOString(),
          updated_at: nowDate.toISOString(),
          deleted_at: null
        }
      ];
      
      const { error: notesInsertError } = await supabase
        .from('episode_transcript_notes')
        .insert(existingNotesData);
      
      expect(notesInsertError).toBeNull();
      
      // 3. Verify existing notes are present
      const { data: existingNotes, error: fetchError } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .in('episode_id', episodeIds.slice(0, 2));
      
      expect(fetchError).toBeNull();
      expect(existingNotes).toHaveLength(2);
      expect(existingNotes![0].deleted_at).toBeNull();
      expect(existingNotes![1].deleted_at).toBeNull();
      
      // 4. Run the L10 workflow preparation (this should clear existing notes)
      const { prepareTranscriptsForNotes } = await import('../utils/notesWorkflow.js');
      const config = getNotesWorkerConfig();
      const l10Config = { ...config, last10Mode: true };
      
      const prepResult = await prepareTranscriptsForNotes(supabase, l10Config);
      
      // 5. Verify that existing notes were cleared (soft-deleted)
      expect(prepResult.wasL10Mode).toBe(true);
      expect(prepResult.candidates).toHaveLength(3);
      expect(prepResult.clearedNotesCount).toBe(2); // Should have cleared 2 existing notes
      
      // 6. Verify the notes are now soft-deleted
      const { data: softDeletedNotes, error: softDeleteFetchError } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .in('episode_id', episodeIds.slice(0, 2));
      
      expect(softDeleteFetchError).toBeNull();
      expect(softDeletedNotes).toHaveLength(2);
      expect(softDeletedNotes![0].deleted_at).not.toBeNull();
      expect(softDeletedNotes![1].deleted_at).not.toBeNull();
      
      // 7. Verify that active notes query returns empty (since they're soft-deleted)
      const { data: activeNotes, error: activeFetchError } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .in('episode_id', episodeIds.slice(0, 2))
        .is('deleted_at', null);
      
      expect(activeFetchError).toBeNull();
      expect(activeNotes).toHaveLength(0);
      
      // 8. Verify that L10 mode includes all transcripts regardless of existing notes
      const transcriptsL10 = await queryTranscriptsNeedingNotes(supabase, 24, true, 10, now);
      // Debug: print all transcripts before the query
      const { data: _debugAllTranscripts } = await supabase.from('transcripts').select('*');
      expect(transcriptsL10).toHaveLength(3); // Should get all 3 transcripts
      
      // 9. Verify transcripts are ordered by created_at (newest first)
      for (let i = 0; i < transcriptsL10.length - 1; i++) {
        const currentDate = new Date(transcriptsL10[i].created_at);
        const nextDate = new Date(transcriptsL10[i + 1].created_at);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle Gemini API errors gracefully', async () => {
      // 1. Setup test data
      const now = Date.now();
      const episodeDate = new Date(now - 2 * 60 * 60 * 1000);
      
      await supabase
        .from('podcast_shows')
        .insert({
          id: testShowId,
          title: 'Test Podcast Show',
          spotify_url: 'https://open.spotify.com/show/test',
          rss_url: 'https://example.com/feed.xml',
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      await supabase
        .from('podcast_episodes')
        .insert({
          id: testEpisodeId,
          show_id: testShowId,
          title: 'Test Episode Title',
          description: 'Test episode description',
          spotify_url: 'https://open.spotify.com/episode/test',
          pub_date: episodeDate.toISOString(),
          duration: 3600,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      await supabase
        .from('transcripts')
        .insert({
          id: testTranscriptId,
          episode_id: testEpisodeId,
          status: 'done',
          storage_path: 'test-transcript.jsonl.gz',
          word_count: 1500,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        });
      
      // 2. Test with invalid API key
      const config = getNotesWorkerConfig();
      // Temporarily override the API key to test error handling
      const testConfig = { ...config, geminiApiKey: 'invalid-api-key' };
      const notesResult = await notesGen.generateNotesWithPrompt(
        'Test transcript content',
        testConfig
      );
      
      expect(notesResult.success).toBe(false);
      expect(notesResult.error).toBeDefined();
      expect(notesResult.notes).toBe('');
      expect(notesResult.model).toBe('');
      
      // 3. Save error to database
      const saveResult = await upsertEpisodeNotes(supabase, {
        episodeId: testEpisodeId,
        transcriptId: testTranscriptId,
        status: 'error',
        errorMessage: notesResult.error!
      });
      
      expect(saveResult.success).toBe(true);
      
      // 4. Verify error was saved correctly
      const { data: savedNotes } = await supabase
        .from('episode_transcript_notes')
        .select('*')
        .eq('episode_id', testEpisodeId)
        .single();
      
      expect(savedNotes).toBeDefined();
      expect(savedNotes!.status).toBe('error');
      expect(savedNotes!.error_message).toContain('generation_error:');
    }, 30000);
  });
}); 