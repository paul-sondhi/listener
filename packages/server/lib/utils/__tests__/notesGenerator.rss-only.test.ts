import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateNotesWithPrompt } from '../notesGenerator';
import { NotesWorkerConfig } from '../../../config/notesWorkerConfig';
import * as gemini from '../../llm/gemini';

// Mock the Gemini module
vi.mock('../../llm/gemini');

describe('generateNotesWithPrompt - RSS-only podcasts', () => {
  let mockConfig: NotesWorkerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock config with prompt template containing placeholders
    mockConfig = {
      enabled: true,
      lookbackHours: 24,
      last10Mode: false,
      last10Count: 10,
      maxConcurrency: 30,
      promptPath: 'prompts/episode-notes.md',
      promptTemplate: `## REQUIRED PODCAST INFORMATION
**Show Name**: [SHOW_TITLE]
**Spotify URL**: [SPOTIFY_URL]

Analyze this podcast episode...`,
      geminiApiKey: 'test-key'
    };
  });

  it('should replace spotify_url with placeholder text for RSS-only podcasts', async () => {
    const mockTranscript = 'This is a test transcript about technology.';
    
    // Mock successful Gemini API response
    vi.mocked(gemini.generateEpisodeNotes).mockResolvedValue({
      notes: '**Technology Discussion**\n- Key points about tech',
      model: 'gemini-1.5-flash'
    });

    // Call with undefined spotifyUrl (RSS-only podcast)
    const result = await generateNotesWithPrompt(
      mockTranscript,
      mockConfig,
      {
        showTitle: 'Tech Talk Podcast',
        spotifyUrl: undefined
      }
    );

    // Verify successful result
    expect(result.success).toBe(true);
    expect(result.notes).toBe('**Technology Discussion**\n- Key points about tech');
    
    // Capture the actual prompt sent to Gemini
    const callArgs = vi.mocked(gemini.generateEpisodeNotes).mock.calls[0];
    const actualPrompt = callArgs[1].systemPrompt;
    
    // Verify placeholders were replaced correctly
    expect(actualPrompt).toContain('**Show Name**: Tech Talk Podcast');
    expect(actualPrompt).toContain('**Spotify URL**: (RSS-only podcast)');
    expect(actualPrompt).not.toContain('[SHOW_TITLE]');
    expect(actualPrompt).not.toContain('[SPOTIFY_URL]');
    expect(actualPrompt).toContain(mockTranscript);
  });

  it('should handle regular podcasts with spotify_url normally', async () => {
    const mockTranscript = 'This is a test transcript about music.';
    
    // Mock successful Gemini API response
    vi.mocked(gemini.generateEpisodeNotes).mockResolvedValue({
      notes: '**Music Discussion**\n- Key points about music',
      model: 'gemini-1.5-flash'
    });

    // Call with actual spotifyUrl
    const result = await generateNotesWithPrompt(
      mockTranscript,
      mockConfig,
      {
        showTitle: 'Music Hour',
        spotifyUrl: 'https://open.spotify.com/show/abc123'
      }
    );

    // Verify successful result
    expect(result.success).toBe(true);
    expect(result.notes).toBe('**Music Discussion**\n- Key points about music');
    
    // Capture the actual prompt sent to Gemini
    const callArgs = vi.mocked(gemini.generateEpisodeNotes).mock.calls[0];
    const actualPrompt = callArgs[1].systemPrompt;
    
    // Verify placeholders were replaced correctly
    expect(actualPrompt).toContain('**Show Name**: Music Hour');
    expect(actualPrompt).toContain('**Spotify URL**: https://open.spotify.com/show/abc123');
    expect(actualPrompt).not.toContain('(RSS-only podcast)');
  });
});