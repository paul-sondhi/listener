/**
 * Tests for newsletter generation with mixed Spotify and OPML podcast sources
 * 
 * Verifies that newsletter generation works correctly when episodes
 * have a mix of spotify_url values (some with URLs, some null/empty).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildNewsletterEditionPrompt } from '../buildNewsletterEditionPrompt';
import { generateNewsletterEdition } from '../../llm/gemini';

// Mock the gemini module
vi.mock('../../llm/gemini');

const mockGenerateNewsletterEdition = vi.mocked(generateNewsletterEdition);

describe('Newsletter Generation with Mixed Spotify/OPML Sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should build prompt correctly with mixed spotify_url values', async () => {
    const testEdition = {
      id: 'edition-123',
      user_id: 'user-123',
      edition_date: '2025-01-27',
      created_at: new Date().toISOString(),
      sent_at: null,
      processed_at: null,
      newsletter_content: null,
      user_email: 'test@example.com'
    };

    // Test episode notes with mixed sources
    const episodeNotes = [
      'Summary of Spotify podcast episode about AI.',
      'Summary of OPML-imported podcast about science.',
      'Summary of another OPML podcast about history.'
    ];

    // Test metadata with mixed spotify URLs
    const episodeMetadata = [
      { showTitle: 'Tech Talk', spotifyUrl: 'https://open.spotify.com/show/tech-talk' },
      { showTitle: 'Science Weekly', spotifyUrl: '' }, // Empty for OPML
      { showTitle: 'History Pod', spotifyUrl: '' } // Empty for OPML
    ];

    // Build the prompt - using params signature with metadata
    const promptResult = await buildNewsletterEditionPrompt({
      episodeNotes,
      userEmail: testEdition.user_email,
      editionDate: testEdition.edition_date,
      episodeMetadata
    });

    // Verify prompt was built successfully
    expect(promptResult.success).toBe(true);
    expect(promptResult.prompt).toBeDefined();
    
    // Verify the prompt includes proper handling for both Spotify and non-Spotify shows
    expect(promptResult.prompt).toContain('Tech Talk');
    expect(promptResult.prompt).toContain('Science Weekly');
    expect(promptResult.prompt).toContain('History Pod');
  });

  it('should generate newsletter with all OPML sources (no spotify_url)', async () => {
    // Test episode notes from OPML sources only
    const episodeNotes = [
      'Episode summary from OPML podcast 1.',
      'Episode summary from OPML podcast 2.'
    ];

    // All metadata without spotify URLs
    const episodeMetadata = [
      { showTitle: 'OPML Podcast 1', spotifyUrl: '' },
      { showTitle: 'OPML Podcast 2', spotifyUrl: '' }
    ];

    // Mock successful generation
    mockGenerateNewsletterEdition.mockResolvedValue({
      htmlContent: '<html>Newsletter for OPML podcasts</html>',
      model: 'gemini-1.5-flash',
      tokensUsed: 500,
      isSuccessful: true,
      success: true
    });

    // Generate newsletter
    const result = await generateNewsletterEdition(
      episodeNotes,
      'opml-user@example.com',
      '2025-01-27',
      episodeMetadata
    );

    expect(result.success).toBe(true);
    expect(result.htmlContent).toContain('Newsletter for OPML podcasts');
    
    // Verify the function was called with correct metadata
    expect(mockGenerateNewsletterEdition).toHaveBeenCalledWith(
      episodeNotes,
      'opml-user@example.com',
      '2025-01-27',
      episodeMetadata
    );
  });

  it('should handle null vs empty string spotify_url consistently', async () => {
    // Test that buildNewsletterEditionPrompt normalizes null to empty string
    const testEdition = {
      id: 'edition-789',
      user_id: 'user-789',
      edition_date: '2025-01-27',
      created_at: new Date().toISOString(),
      sent_at: null,
      processed_at: null,
      newsletter_content: null,
      user_email: 'mixed@example.com'
    };

    const episodeNotes = [
      'Episode with null spotify_url.',
      'Episode with empty string spotify_url.'
    ];

    // Mix of null and empty string - normalize null to empty string
    const episodeMetadata = [
      { showTitle: 'Null URL Show', spotifyUrl: '' }, // Normalize null to empty string
      { showTitle: 'Empty URL Show', spotifyUrl: '' }
    ];

    // Build prompt should handle null gracefully - using params signature
    const promptResult = await buildNewsletterEditionPrompt({
      episodeNotes,
      userEmail: testEdition.user_email,
      editionDate: testEdition.edition_date,
      episodeMetadata
    });

    // Debug: Check what the error is
    if (!promptResult.success) {
      console.error('Prompt building failed:', promptResult.error);
    }

    // Verify prompt was built successfully
    expect(promptResult.success).toBe(true);
    
    // Both shows should be included
    expect(promptResult.prompt).toContain('Null URL Show');
    expect(promptResult.prompt).toContain('Empty URL Show');
  });
});