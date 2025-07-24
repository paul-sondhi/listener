import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { processEpisodeForNotes } from '../episodeProcessor';
import { TranscriptWithEpisode } from '../../db/notesQueries';
import * as transcriptDownloader from '../transcriptDownloader';
import * as notesGenerator from '../notesGenerator';
import * as notesDatabase from '../../db/notesDatabase';
import { NotesWorkerConfig } from '../../../config/notesWorkerConfig';

// Mock the dependencies
vi.mock('../transcriptDownloader');
vi.mock('../notesGenerator');
vi.mock('../../db/notesDatabase');

describe('processEpisodeForNotes - RSS-only podcasts', () => {
  let mockSupabase: SupabaseClient;
  let mockConfig: NotesWorkerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase client
    mockSupabase = {} as SupabaseClient;
    
    // Mock config
    mockConfig = {
      enabled: true,
      lookbackHours: 24,
      last10Mode: false,
      last10Count: 10,
      maxConcurrency: 30,
      promptPath: 'prompts/episode-notes.md',
      promptTemplate: 'Test prompt template',
      geminiApiKey: 'test-key'
    };
  });

  it('should successfully process episodes from RSS-only podcasts (no spotify_url)', async () => {
    // Create a transcript with episode data but no spotify_url
    const mockTranscript: TranscriptWithEpisode = {
      id: 'transcript-123',
      episode_id: 'episode-456',
      storage_path: 'transcripts/test.json',
      created_at: '2025-07-24T10:00:00Z',
      updated_at: '2025-07-24T10:00:00Z',
      status: 'processed',
      error_details: null,
      episode: {
        id: 'episode-456',
        title: 'Test Episode',
        podcast_shows: {
          id: 'show-789',
          title: 'RSS-Only Podcast Show',
          spotify_url: null, // RSS-only podcast has no Spotify URL
          rss_url: 'https://example.com/podcast.rss'
        }
      }
    };

    // Mock successful transcript download
    vi.mocked(transcriptDownloader.downloadAndParseTranscript).mockResolvedValue({
      transcript: 'This is the test transcript content.',
      wordCount: 5,
      fileSizeBytes: 100
    });

    // Mock successful notes generation
    vi.mocked(notesGenerator.generateNotesWithPrompt).mockResolvedValue({
      notes: '**Test Notes**\n- Generated notes content',
      model: 'gemini-1.5-flash',
      elapsedMs: 1000,
      success: true
    });

    // Mock successful database upsert
    vi.mocked(notesDatabase.upsertEpisodeNotes).mockResolvedValue({
      success: true,
      noteId: 'note-123'
    });

    // Process the episode
    const result = await processEpisodeForNotes(mockSupabase, mockTranscript, mockConfig);

    // Verify the result
    expect(result.status).toBe('done');
    expect(result.episodeId).toBe('episode-456');
    expect(result.notes).toBe('**Test Notes**\n- Generated notes content');
    expect(result.model).toBe('gemini-1.5-flash');
    
    // Verify that generateNotesWithPrompt was called with undefined spotifyUrl
    expect(notesGenerator.generateNotesWithPrompt).toHaveBeenCalledWith(
      'This is the test transcript content.',
      mockConfig,
      {
        showTitle: 'RSS-Only Podcast Show',
        spotifyUrl: undefined
      }
    );
  });

  it('should still require podcast title even for RSS-only podcasts', async () => {
    // Create a transcript with missing title
    const mockTranscript: TranscriptWithEpisode = {
      id: 'transcript-123',
      episode_id: 'episode-456',
      storage_path: 'transcripts/test.json',
      created_at: '2025-07-24T10:00:00Z',
      updated_at: '2025-07-24T10:00:00Z',
      status: 'processed',
      error_details: null,
      episode: {
        id: 'episode-456',
        title: 'Test Episode',
        podcast_shows: {
          id: 'show-789',
          title: null, // Missing title should still cause error
          spotify_url: null,
          rss_url: 'https://example.com/podcast.rss'
        }
      }
    };

    // Mock database error recording
    vi.mocked(notesDatabase.upsertEpisodeNotes).mockResolvedValue({
      success: true,
      noteId: 'error-note'
    });

    // Process the episode
    const result = await processEpisodeForNotes(mockSupabase, mockTranscript, mockConfig);

    // Verify it failed due to missing title
    expect(result.status).toBe('error');
    expect(result.error).toBe('Missing required podcast metadata: title must be present');
    
    // Verify that transcript download and notes generation were NOT called
    expect(transcriptDownloader.downloadAndParseTranscript).not.toHaveBeenCalled();
    expect(notesGenerator.generateNotesWithPrompt).not.toHaveBeenCalled();
  });
});