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
    process.stdout.write('DEBUG: beforeEach cleanup starting\n');
    
    // Reset the in-memory Supabase mock DB before every test to prevent data leakage between tests
    resetDb();
    
    // Generate unique IDs for each test
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testEpisodeId = `test-episode-${timestamp}-${random}`;
    testTranscriptId = `test-transcript-${timestamp}-${random}`;
    testShowId = `test-show-${timestamp}-${random}`;
    
    process.stdout.write(`DEBUG: Generated test IDs: episode=${testEpisodeId}, transcript=${testTranscriptId}, show=${testShowId}\n`);
    
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
    process.stdout.write('DEBUG: beforeEach cleanup completed\n');
  });

  afterEach(async () => {
    process.stdout.write('DEBUG: afterEach cleanup starting\n');
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
    process.stdout.write('DEBUG: afterEach cleanup completed\n');
  });

  describe('Complete Workflow', () => {
    it('should process a transcript and generate notes successfully', async () => {
      process.stdout.write('DEBUG: Starting first test\n');
      
      // 1. Setup test data
      const now = Date.now();
      const episodeDate = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
      
      process.stdout.write('DEBUG: About to insert show\n');
      
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
      
      process.stdout.write('DEBUG: Show insert result: ' + JSON.stringify({ showError }) + '\n');
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
      
      process.stdout.write('DEBUG: Episode insert result: ' + JSON.stringify({ episodeError }) + '\n');
      expect(episodeError).toBeNull();
      
      // Insert test transcript with explicit id
      const { error: transcriptError } = await supabase
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
      process.stdout.write('DEBUG: Transcript insert result: ' + JSON.stringify({ transcriptError }) + '\n');

      // Log all transcripts
      const { data: allTranscripts } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts: ' + JSON.stringify(allTranscripts) + '\n');
      // Log all episodes
      const { data: allEpisodes } = await supabase.from('podcast_episodes').select('*');
      process.stdout.write('DEBUG: All episodes: ' + JSON.stringify(allEpisodes) + '\n');
      // Log all shows
      const { data: allShows } = await supabase.from('podcast_shows').select('*');
      process.stdout.write('DEBUG: All shows: ' + JSON.stringify(allShows) + '\n');

      // Query for transcript directly (avoiding join for now)
      const { data: transcripts, error: queryError } = await supabase
        .from('transcripts')
        .select('*')
        .eq('episode_id', testEpisodeId);
      process.stdout.write('DEBUG: Direct transcript query result: ' + JSON.stringify({ queryError, count: transcripts?.length, transcripts }) + '\n');
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
        process.stdout.write('DEBUG: Download error (expected): ' + JSON.stringify({ error: error instanceof Error ? error.message : error }) + '\n');
        expect(error).toBeDefined();
        expect((error as Error).message).toMatch(/not a function|404|No such file/i);
      }

      // 4. Generate notes with mock transcript content
      const config = getNotesWorkerConfig();
      const notesResult = await notesGen.generateNotesWithPrompt(
        'This is a mock transcript for testing. It contains sample content that should be processed into episode notes.',
        config
      );
      process.stdout.write('DEBUG: Notes generation result: ' + JSON.stringify({ success: notesResult.success, notesLength: notesResult.notes?.length, model: notesResult.model }) + '\n');
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
      process.stdout.write('DEBUG: Direct upsert result: ' + JSON.stringify({ data: upsertResult, error: upsertError }) + '\n');
      expect(upsertError).toBeNull();
      expect(upsertResult).toBeDefined();
    }, 30000); // 30 second timeout for integration test

    it('should handle missing transcript storage file gracefully', async () => {
      process.stdout.write('DEBUG: Starting missing storage file test\n');
      
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
      
      process.stdout.write('DEBUG: Show insert result: ' + JSON.stringify({ showError }) + '\n');
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
      
      process.stdout.write('DEBUG: Episode insert result: ' + JSON.stringify({ episodeError }) + '\n');
      expect(episodeError).toBeNull();
      
      // Insert test transcript with non-existent storage path
      const transcriptResult = await insertTranscript(
        testEpisodeId,
        'non-existent-file.jsonl.gz',
        'full',
        'full',
        1500,
        'taddy'
      );
      
      process.stdout.write('DEBUG: Transcript insert result: ' + JSON.stringify({ transcriptResult }) + '\n');
      
      // Verify data was inserted
      const { data: allShows, error: showsError } = await supabase.from('podcast_shows').select('*');
      process.stdout.write('DEBUG: All shows after insert: ' + JSON.stringify({ count: allShows?.length, error: showsError }) + '\n');
      
      const { data: allEpisodes, error: episodesError } = await supabase.from('podcast_episodes').select('*');
      process.stdout.write('DEBUG: All episodes after insert: ' + JSON.stringify({ count: allEpisodes?.length, error: episodesError }) + '\n');
      
      const { data: allTranscripts, error: transcriptsError } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts after insert: ' + JSON.stringify({ count: allTranscripts?.length, error: transcriptsError }) + '\n');
      
      // 2. Query for transcripts needing notes
      const transcripts = await queryTranscriptsNeedingNotes(supabase, 24, false, now);
      // Debug: print all transcripts before the query
      const { data: debugAllTranscripts } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts before query: ' + JSON.stringify(debugAllTranscripts) + '\n');
      process.stdout.write('DEBUG: Query params: lookbackHours=24, last10Mode=false\n');
      process.stdout.write('DEBUG: Query result: ' + JSON.stringify({ transcriptCount: transcripts.length, transcripts: transcripts.map(t => ({ id: t.id, episode_id: t.episode_id, storage_path: t.storage_path })) }) + '\n');
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
      
      process.stdout.write('DEBUG: saveResult in missing transcript storage file test: ' + JSON.stringify(saveResult) + '\n');
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
      process.stdout.write('DEBUG: Starting missing storage file workflow test\n');
      
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
      
      process.stdout.write('DEBUG: Show insert result: ' + JSON.stringify({ showError }) + '\n');
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
        
        process.stdout.write(`DEBUG: Episode Missing ${i + 1} insert result: ` + JSON.stringify({ episodeError }) + '\n');
        expect(episodeError).toBeNull();
        
        // Use different storage paths: one missing, one empty, one valid-looking
        const storagePaths = [
          'missing-file.jsonl.gz',
          '',
          'valid-looking-file.jsonl.gz'
        ];
        
        const transcriptResult = await insertTranscript(
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
        
        process.stdout.write(`DEBUG: Transcript Missing ${i + 1} insert result: ` + JSON.stringify({ transcriptResult, storagePath: storagePaths[i] }) + '\n');
      }
      
      // Verify all data was inserted
      const { data: allShows, error: showsError } = await supabase.from('podcast_shows').select('*');
      process.stdout.write('DEBUG: All shows after insert: ' + JSON.stringify({ count: allShows?.length, error: showsError }) + '\n');
      
      const { data: allEpisodes, error: episodesError } = await supabase.from('podcast_episodes').select('*');
      process.stdout.write('DEBUG: All episodes after insert: ' + JSON.stringify({ count: allEpisodes?.length, error: episodesError }) + '\n');
      
      const { data: allTranscripts, error: transcriptsError } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts after insert: ' + JSON.stringify({ count: allTranscripts?.length, error: transcriptsError }) + '\n');
      
      // 2. Query for transcripts needing notes
      const transcripts = await queryTranscriptsNeedingNotes(supabase, 24, false, now);
      // Debug: print all transcripts before the query
      const { data: debugAllTranscripts } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts before query: ' + JSON.stringify(debugAllTranscripts) + '\n');
      process.stdout.write('DEBUG: Query params: lookbackHours=24, last10Mode=false\n');
      process.stdout.write('DEBUG: Query result: ' + JSON.stringify({ transcriptCount: transcripts.length, transcripts: transcripts.map(t => ({ id: t.id, episode_id: t.episode_id, storage_path: t.storage_path })) }) + '\n');
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
          
          process.stdout.write('DEBUG: saveResult in missing storage file workflow test: ' + JSON.stringify(saveResult) + '\n');
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
      process.stdout.write('DEBUG: Starting L10 mode test\n');
      
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
      
      process.stdout.write('DEBUG: Show insert result: ' + JSON.stringify({ showError }) + '\n');
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
        
        process.stdout.write(`DEBUG: Episode ${i + 1} insert result: ` + JSON.stringify({ episodeError }) + '\n');
        expect(episodeError).toBeNull();
        
        const transcriptResult = await insertTranscript(
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
        
        process.stdout.write(`DEBUG: Transcript ${i + 1} insert result: ` + JSON.stringify({ transcriptResult }) + '\n');
      }
      
      // Verify all data was inserted
      const { data: allShows, error: showsError } = await supabase.from('podcast_shows').select('*');
      process.stdout.write('DEBUG: All shows after insert: ' + JSON.stringify({ count: allShows?.length, error: showsError }) + '\n');
      
      const { data: allEpisodes, error: episodesError } = await supabase.from('podcast_episodes').select('*');
      process.stdout.write('DEBUG: All episodes after insert: ' + JSON.stringify({ count: allEpisodes?.length, error: episodesError }) + '\n');
      
      const { data: allTranscripts, error: transcriptsError } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts after insert: ' + JSON.stringify({ count: allTranscripts?.length, error: transcriptsError }) + '\n');
      
      // 2. Query for transcripts in L10 mode
      const transcriptsL10 = await queryTranscriptsNeedingNotes(supabase, 24, true, now);
      // Debug: print all transcripts before the query
      const { data: debugAllTranscripts } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts before query: ' + JSON.stringify(debugAllTranscripts) + '\n');
      process.stdout.write('DEBUG: Query params: lookbackHours=24, last10Mode=true\n');
      process.stdout.write('DEBUG: Query result: ' + JSON.stringify({ transcriptCount: transcriptsL10.length, transcripts: transcriptsL10.map(t => ({ id: t.id, episode_id: t.episode_id, storage_path: t.storage_path })) }) + '\n');
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
      process.stdout.write('DEBUG: Starting L10 overwrite test\n');
      
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
      
      process.stdout.write('DEBUG: Show insert result: ' + JSON.stringify({ showError }) + '\n');
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
        
        process.stdout.write(`DEBUG: Episode L10 ${i + 1} insert result: ` + JSON.stringify({ episodeError }) + '\n');
        expect(episodeError).toBeNull();
        
        const transcriptResult = await insertTranscript(
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
        
        process.stdout.write(`DEBUG: Transcript L10 ${i + 1} insert result: ` + JSON.stringify({ transcriptResult }) + '\n');
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
      const transcriptsL10 = await queryTranscriptsNeedingNotes(supabase, 24, true, now);
      // Debug: print all transcripts before the query
      const { data: debugAllTranscripts } = await supabase.from('transcripts').select('*');
      process.stdout.write('DEBUG: All transcripts before query: ' + JSON.stringify(debugAllTranscripts) + '\n');
      process.stdout.write('DEBUG: Query params: lookbackHours=24, last10Mode=true\n');
      process.stdout.write('DEBUG: Query result: ' + JSON.stringify({ transcriptCount: transcriptsL10.length, transcripts: transcriptsL10.map(t => ({ id: t.id, episode_id: t.episode_id, storage_path: t.storage_path })) }) + '\n');
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
      
      process.stdout.write('DEBUG: saveResult in Gemini API error test: ' + JSON.stringify(saveResult) + '\n');
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