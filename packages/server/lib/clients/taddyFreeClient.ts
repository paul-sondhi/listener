import { GraphQLClient } from 'graphql-request';
import { getSdk, TaddyPodcastEpisode, TaddyTranscript } from '../../generated/taddy.js';
import { TranscriptResult } from '../../../shared/src/types/index.js';
import { logger } from '../logger.js';
import { withHttpRetry } from '../utils/retry.js';

/**
 * Configuration for the TaddyFreeClient
 */
export interface TaddyFreeClientConfig {
  apiKey: string;
  endpoint?: string;
  timeout?: number;
  userAgent?: string;
}

/**
 * Client for accessing Taddy's Free tier GraphQL API
 * 
 * This client provides read-only access to existing transcripts without
 * triggering any paid operations. It implements retry logic and classifies
 * responses into a discriminated union for type-safe error handling.
 * 
 * Usage:
 * ```typescript
 * const client = new TaddyFreeClient({ apiKey: process.env.TADDY_API_KEY! });
 * const result = await client.fetchTranscript('https://feeds.example.com/rss', 'episode-guid-123');
 * 
 * if (result.kind === 'full') {
 *   console.log(`Found transcript: ${result.text.length} chars, ${result.wordCount} words`);
 * } else if (result.kind === 'partial') {
 *   console.log(`Partial transcript: ${result.text.length} chars`);
 * } else {
 *   console.log(`No transcript: ${result.kind}`);
 * }
 * ```
 */
export class TaddyFreeClient {
  private readonly client: GraphQLClient;
  private readonly sdk: ReturnType<typeof getSdk>;
  private readonly config: Required<TaddyFreeClientConfig>;

  constructor(config: TaddyFreeClientConfig) {
    this.config = {
      endpoint: 'https://api.taddy.org/graphql',
      timeout: 10000, // 10 seconds
      userAgent: 'listener-app/1.0.0 (GraphQL Free Client)',
      ...config,
    };

    // Initialize GraphQL client with authentication and headers
    this.client = new GraphQLClient(this.config.endpoint, {
      headers: {
        'X-API-KEY': this.config.apiKey,
        'User-Agent': this.config.userAgent,
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    });

    // Get the typed SDK wrapper
    this.sdk = getSdk(this.client);

    logger.debug('TaddyFreeClient initialized', {
      endpoint: this.config.endpoint,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey,
    });
  }

  /**
   * Fetches transcript for a podcast episode using RSS feed URL and episode GUID
   * 
   * This method implements the Free tier lookup logic:
   * 1. Query for the podcast series by RSS URL
   * 2. Query for the specific episode by GUID
   * 3. Extract transcript data if available
   * 4. Classify the result based on transcript completeness
   * 
   * @param feedUrl - RSS feed URL of the podcast
   * @param episodeGuid - Unique identifier for the episode
   * @returns Promise resolving to TranscriptResult discriminated union
   */
  async fetchTranscript(feedUrl: string, episodeGuid: string): Promise<TranscriptResult> {
    const startTime = Date.now();
    
    logger.debug('Starting Taddy Free transcript lookup', {
      feedUrl,
      episodeGuid,
    });

    try {
      // Step 1: Look up the podcast series by RSS URL with retry logic
      // Note: The actual Taddy API might use different field names
      // This will need to be updated when we fetch the real schema
      const podcastResult = await withHttpRetry(
        () => this.sdk.getPodcastSeries?.({
          rssUrl: feedUrl,
        }),
        { maxAttempts: 2 }
      );

      if (!podcastResult) {
        logger.debug('No podcast series found for RSS URL', { feedUrl });
        return { kind: 'no_match' };
      }

      // Step 2: Look up the specific episode by GUID with retry logic
      const episodeResult = await withHttpRetry(
        () => this.sdk.getPodcastEpisode?.({
          guid: episodeGuid,
          seriesUuidForLookup: podcastResult.uuid,
        }),
        { maxAttempts: 2 }
      );

      if (!episodeResult) {
        logger.debug('No episode found for GUID', { 
          episodeGuid, 
          podcastUuid: podcastResult.uuid,
          podcastName: podcastResult.name,
          context: 'This would result in no_match status'
        });
        return { kind: 'no_match' };
      }

      // Step 3: Extract transcript data
      const transcript = this.extractBestTranscript(episodeResult);
      
      if (!transcript) {
        logger.debug('Episode found but no transcript available', { episodeGuid });
        return { kind: 'not_found' };
      }

      // Step 4: Classify transcript completeness
      const result = this.classifyTranscript(transcript);
      
      const duration = Date.now() - startTime;
      logger.info('Taddy Free transcript lookup completed', {
        feedUrl,
        episodeGuid,
        result: result.kind,
        duration,
        wordCount: 'wordCount' in result ? result.wordCount : undefined,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Taddy Free transcript lookup failed', {
        feedUrl,
        episodeGuid,
        error: errorMessage,
        duration,
      });

      return {
        kind: 'error',
        message: `Taddy API error: ${errorMessage}`,
      };
    }
  }

  /**
   * Extracts the best available transcript from an episode
   * Prefers complete transcripts over partial ones
   */
  private extractBestTranscript(episode: TaddyPodcastEpisode): TaddyTranscript | null {
    const transcripts = episode.transcripts;
    
    if (!transcripts || transcripts.length === 0) {
      return null;
    }

    // Sort transcripts by completeness (complete first, then by word count)
    const sortedTranscripts = [...transcripts].sort((a, b) => {
      // Prefer complete transcripts
      if (!a.isPartial && b.isPartial) return -1;
      if (a.isPartial && !b.isPartial) return 1;
      
      // If both are same type, prefer higher word count
      const aWordCount = a.wordCount || 0;
      const bWordCount = b.wordCount || 0;
      return bWordCount - aWordCount;
    });

    return sortedTranscripts[0];
  }

  /**
   * Classifies a transcript into the appropriate result type
   * Based on the isPartial flag and percentComplete if available
   */
  private classifyTranscript(transcript: TaddyTranscript): TranscriptResult {
    const wordCount = transcript.wordCount || this.estimateWordCount(transcript.text);
    
    if (transcript.isPartial) {
      logger.debug('Classified as partial transcript', {
        percentComplete: transcript.percentComplete,
        wordCount,
        textLength: transcript.text.length,
      });
      
      return {
        kind: 'partial',
        text: transcript.text,
        wordCount,
      };
    }

    logger.debug('Classified as full transcript', {
      wordCount,
      textLength: transcript.text.length,
    });

    return {
      kind: 'full',
      text: transcript.text,
      wordCount,
    };
  }

  /**
   * Estimates word count from text when not provided by API
   * Simple whitespace-based counting
   */
  private estimateWordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Health check method to verify API connectivity
   * Useful for monitoring and debugging
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try a minimal query to test connectivity with retry
      // This might need adjustment based on actual Taddy schema
      await withHttpRetry(
        () => this.client.request('query { __typename }'),
        { maxAttempts: 1 } // Only one attempt for health checks
      );
      return true;
    } catch (error) {
      logger.error('Taddy Free client health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
} 