// TODO: Import PodcastEpisodeRow type once it's defined in shared types
type PodcastEpisodeRow = any; // Temporary placeholder

/**
 * TranscriptService - Central service for all transcript-related operations
 * 
 * This is currently a stub implementation that always returns null.
 * Future tickets will add provider integrations in this priority order:
 * 
 * @todo Ticket #4: Add Taddy Free lookup integration (GraphQL, no cost)
 * @todo Ticket #6: Add Taddy Business pregenerated retrieval (existing transcripts)
 * @todo Ticket #8: Add on-demand Taddy jobs (async queue, costs credits)
 * @todo Ticket #9: Add fallback ASR providers (Deepgram/Rev AI, direct cost)
 * @todo Ticket #7: Add cost tracking and provenance metadata
 */
export class TranscriptService {
  /**
   * Retrieve transcript for an episode by ID
   * Currently returns null (stub implementation)
   * 
   * @param episodeId - UUID of the episode
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(episodeId: string): Promise<null>;

  /**
   * Retrieve transcript for an episode object
   * Currently returns null (stub implementation)
   * 
   * @param episode - Full episode row from database
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(episode: PodcastEpisodeRow): Promise<null>;

  /**
   * Implementation signature - handles both overloads
   * @param arg - Either episode ID string or episode row object
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(arg: string | PodcastEpisodeRow): Promise<null> {
    // If caller passed an episode ID string, we need to fetch the episode row first
    if (typeof arg === 'string') {
      const episodeId = arg;
      
      // TODO: Replace with actual database fetch
      // For now, create a stubbed episode row to delegate to overload (2)
      const stubbedEpisode = await this.fetchEpisodeById(episodeId);
      
      // Delegate to the episode object overload
      return this.getTranscript(stubbedEpisode);
    }
    
    // If we reach here, arg is a PodcastEpisodeRow object
    const episode = arg;
    
    // STUB BEHAVIOR: Always return null for now
    // TODO: Future provider logic will be implemented here in the following order:
    // 1. Check if transcript already exists in database
    // 2. Try Taddy Free lookup (no cost)
    // 3. Try Taddy Business pregenerated retrieval (if available)
    // 4. Fall back to on-demand ASR providers (Deepgram/Rev AI)
    // 5. Store result in database with cost/provenance metadata
    return null;
  }

  /**
   * Private helper to fetch episode by ID (stubbed implementation)
   * @param episodeId - UUID of the episode to fetch
   * @returns Promise resolving to a stubbed episode row
   * @private
   */
  private async fetchEpisodeById(episodeId: string): Promise<PodcastEpisodeRow> {
    // TODO: Replace with actual Supabase database query
    // For now, return a minimal stubbed episode object
    return {
      id: episodeId,
      rss_url: 'https://example.com/feed.xml', // Stubbed RSS URL
      deleted_at: null, // Not deleted
      // Add other required fields as needed when proper type is defined
    } as PodcastEpisodeRow;
  }
} 