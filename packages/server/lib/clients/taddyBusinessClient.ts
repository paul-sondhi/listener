import { GraphQLClient } from 'graphql-request';
import { TaddyTranscriptItem } from '../../generated/taddy.js';
import { logger } from '../logger.js';
import { withHttpRetry } from '../utils/retry.js';

/**
 * Discriminated union representing the result of a Business tier transcript lookup
 * This type allows downstream code to handle all possible outcomes including
 * the new 'processing' state that indicates Taddy is still generating the transcript
 */
export type BusinessTranscriptResult =
  | { kind: 'full'; text: string; wordCount: number; source: 'taddy'; creditsConsumed: number }
  | { kind: 'partial'; text: string; wordCount: number; source: 'taddy'; creditsConsumed: number }
  | { kind: 'processing'; source: 'taddy'; creditsConsumed: number }
  | { kind: 'not_found'; creditsConsumed: number }
  | { kind: 'no_match'; creditsConsumed: number }
  | { kind: 'error'; message: string; creditsConsumed?: number };

/**
 * Configuration for the TaddyBusinessClient
 */
export interface TaddyBusinessClientConfig {
  apiKey: string;
  endpoint?: string;
  timeout?: number;
  userAgent?: string;
}

/**
 * Client for accessing Taddy's Business tier GraphQL API
 * 
 * This client provides access to Business tier transcript generation capabilities,
 * including the ability to trigger transcript generation for episodes that don't
 * have transcripts yet. It implements retry logic and classifies responses into
 * a discriminated union for type-safe error handling.
 * 
 * Key differences from Free tier:
 * - Can trigger transcript generation for episodes without existing transcripts
 * - Returns 'processing' status for transcripts still being generated
 * - Consumes credits for each API call
 * - Provides source attribution and credit consumption tracking
 * 
 * Usage:
 * ```typescript
 * const client = new TaddyBusinessClient({ apiKey: process.env.TADDY_API_KEY! });
 * const result = await client.fetchTranscript('https://feeds.example.com/rss', 'episode-guid-123');
 * 
 * if (result.kind === 'full') {
 *   console.log(`Found transcript: ${result.text.length} chars, ${result.wordCount} words`);
 *   console.log(`Credits consumed: ${result.creditsConsumed}`);
 * } else if (result.kind === 'processing') {
 *   console.log(`Transcript being generated, credits consumed: ${result.creditsConsumed}`);
 * } else {
 *   console.log(`No transcript: ${result.kind}`);
 * }
 * ```
 */
export class TaddyBusinessClient {
  private readonly client: GraphQLClient;
  private readonly config: Required<TaddyBusinessClientConfig>;

  constructor(config: TaddyBusinessClientConfig) {
    this.config = {
      endpoint: 'https://api.taddy.org/graphql',
      timeout: 30000, // 30 seconds - Business tier may take longer for generation
      userAgent: 'listener-app/1.0.0 (GraphQL Business Client)',
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

    logger.debug('TaddyBusinessClient initialized', {
      endpoint: this.config.endpoint,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey,
    });
  }

  /**
   * Fetches transcript for a podcast episode using RSS feed URL and episode GUID
   * 
   * This method implements the Business tier lookup logic:
   * 1. Query for the podcast series by RSS URL
   * 2. Query for the specific episode by GUID
   * 3. Extract transcript data if available, or trigger generation if not
   * 4. Classify the result based on transcript status and completeness
   * 5. Track credits consumed for the operation
   * 
   * @param feedUrl - RSS feed URL of the podcast
   * @param episodeGuid - Unique identifier for the episode
   * @returns Promise resolving to BusinessTranscriptResult discriminated union
   */
  async fetchTranscript(feedUrl: string, episodeGuid: string): Promise<BusinessTranscriptResult> {
    const startTime = Date.now();
    
    logger.debug('Starting Taddy Business transcript lookup', {
      feedUrl,
      episodeGuid,
    });

    try {
      // Step 1: Look up the podcast series by RSS URL with retry logic
      const podcastResult = await withHttpRetry(
        () => this.queryPodcastSeries(feedUrl),
        { maxAttempts: 2 }
      );

      if (!podcastResult) {
        logger.debug('No podcast series found for RSS URL', { feedUrl });
        return { kind: 'no_match', creditsConsumed: 1 };
      }

      // Step 2: Look up the specific episode by GUID with retry logic
      const episodeResult = await withHttpRetry(
        () => this.queryPodcastEpisode(podcastResult.uuid, episodeGuid),
        { maxAttempts: 2 }
      );

      if (!episodeResult) {
        logger.debug('No episode found for GUID', { episodeGuid, podcastUuid: podcastResult.uuid });
        return { kind: 'no_match', creditsConsumed: 1 };
      }

      // Step 3: Get transcript for the episode (may trigger generation)
      const transcriptResult = await withHttpRetry(
        () => this.queryEpisodeTranscript(episodeResult.uuid),
        { maxAttempts: 2 }
      );

      // Step 4: Classify transcript result and determine credits consumed
      const result = this.classifyBusinessTranscriptResult(transcriptResult, episodeResult);
      
      const duration = Date.now() - startTime;
      logger.info('Taddy Business transcript lookup completed', {
        feedUrl,
        episodeGuid,
        result: result.kind,
        duration,
        creditsConsumed: result.creditsConsumed,
        wordCount: 'wordCount' in result ? result.wordCount : undefined,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a quota exhaustion error
      if (this.isQuotaExhaustedError(error)) {
        logger.warn('Taddy Business API quota exhausted', {
          feedUrl,
          episodeGuid,
          error: errorMessage,
          duration,
        });
        
        return {
          kind: 'error',
          message: 'CREDITS_EXCEEDED',
          creditsConsumed: 0,
        };
      }
      
      logger.error('Taddy Business transcript lookup failed', {
        feedUrl,
        episodeGuid,
        error: errorMessage,
        duration,
      });

      return {
        kind: 'error',
        message: `Taddy Business API error: ${errorMessage}`,
        creditsConsumed: 0,
      };
    }
  }

  /**
   * Query for podcast series by RSS URL
   */
  private async queryPodcastSeries(rssUrl: string) {
    const query = `
      query GetPodcastSeries($rssUrl: String!) {
        getPodcastSeries(rssUrl: $rssUrl) {
          uuid
          name
          rssUrl
        }
      }
    `;

    const result = await this.client.request(query, { rssUrl });
    return result.getPodcastSeries;
  }

  /**
   * Query for podcast episode by podcast UUID and episode GUID
   */
  private async queryPodcastEpisode(podcastUuid: string, episodeGuid: string) {
    const query = `
      query GetPodcastEpisode($podcastUuid: ID!, $episodeGuid: String!) {
        getPodcastEpisode(podcastSeriesUuid: $podcastUuid, episodeGuid: $episodeGuid) {
          uuid
          name
          guid
          taddyTranscribeStatus
        }
      }
    `;

    const result = await this.client.request(query, { 
      podcastUuid, 
      episodeGuid 
    });
    return result.getPodcastEpisode;
  }

  /**
   * Query for episode transcript by episode UUID
   * This may trigger transcript generation for Business tier clients
   */
  private async queryEpisodeTranscript(episodeUuid: string) {
    const query = `
      query GetEpisodeTranscript($episodeUuid: ID!) {
        getEpisodeTranscript(episodeUuid: $episodeUuid) {
          id
          text
          speaker
          startTimecode
          endTimecode
        }
      }
    `;

    const result = await this.client.request(query, { episodeUuid });
    return result.getEpisodeTranscript;
  }

  /**
   * Classifies a Business tier transcript result into the appropriate result type
   * Takes into account transcript status, completeness, and credit consumption
   */
  private classifyBusinessTranscriptResult(
    transcriptItems: TaddyTranscriptItem[] | null,
    episodeInfo: any
  ): BusinessTranscriptResult {
    // Base credit consumption - Business tier always consumes at least 1 credit
    const baseCredits = 1;

    // Check if transcript is still being processed
    if (episodeInfo?.taddyTranscribeStatus === 'PROCESSING') {
      logger.debug('Episode transcript is still processing', {
        episodeUuid: episodeInfo.uuid,
        status: episodeInfo.taddyTranscribeStatus,
      });
      
      return {
        kind: 'processing',
        source: 'taddy',
        creditsConsumed: baseCredits,
      };
    }

    // Check if transcript generation failed
    if (episodeInfo?.taddyTranscribeStatus === 'FAILED') {
      logger.debug('Episode transcript generation failed', {
        episodeUuid: episodeInfo.uuid,
        status: episodeInfo.taddyTranscribeStatus,
      });
      
      return {
        kind: 'not_found',
        creditsConsumed: baseCredits,
      };
    }

    // No transcript items returned
    if (!transcriptItems || transcriptItems.length === 0) {
      logger.debug('No transcript items found for episode', {
        episodeUuid: episodeInfo.uuid,
      });
      
      return {
        kind: 'not_found',
        creditsConsumed: baseCredits,
      };
    }

    // Process transcript items into full text
    const fullText = this.assembleTranscriptText(transcriptItems);
    const wordCount = this.estimateWordCount(fullText);

    // Determine if transcript is complete or partial
    // For Business tier, we assume all returned transcripts are complete
    // unless specifically marked otherwise (this logic may need refinement
    // based on actual Taddy API behavior)
    const isComplete = this.isTranscriptComplete(transcriptItems, episodeInfo);

    if (isComplete) {
      logger.debug('Classified as full Business transcript', {
        episodeUuid: episodeInfo.uuid,
        wordCount,
        textLength: fullText.length,
        itemCount: transcriptItems.length,
      });

      return {
        kind: 'full',
        text: fullText,
        wordCount,
        source: 'taddy',
        creditsConsumed: baseCredits,
      };
    } else {
      logger.debug('Classified as partial Business transcript', {
        episodeUuid: episodeInfo.uuid,
        wordCount,
        textLength: fullText.length,
        itemCount: transcriptItems.length,
      });

      return {
        kind: 'partial',
        text: fullText,
        wordCount,
        source: 'taddy',
        creditsConsumed: baseCredits,
      };
    }
  }

  /**
   * Assembles transcript items into a single text string
   * Preserves speaker information and timing when available
   */
  private assembleTranscriptText(items: TaddyTranscriptItem[]): string {
    return items
      .filter(item => item.text && item.text.trim().length > 0)
      .map(item => {
        // Include speaker information if available
        if (item.speaker && item.speaker.trim().length > 0) {
          return `${item.speaker}: ${item.text}`;
        }
        return item.text;
      })
      .join('\n')
      .trim();
  }

  /**
   * Determines if a transcript is complete based on available metadata
   * This is a heuristic that may need refinement based on actual API behavior
   */
  private isTranscriptComplete(
    items: TaddyTranscriptItem[],
    episodeInfo: any
  ): boolean {
    // If episode status is explicitly marked as completed, trust it
    if (episodeInfo?.taddyTranscribeStatus === 'COMPLETED') {
      return true;
    }

    // For Business tier, we generally assume transcripts are complete
    // unless there are specific indicators otherwise
    // This logic may need to be refined based on actual API behavior
    return true;
  }

  /**
   * Estimates word count from text when not provided by API
   * Simple whitespace-based counting
   */
  private estimateWordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Checks if an error indicates quota exhaustion
   */
  private isQuotaExhaustedError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || '';
    const errorResponse = error.response;
    
    // Check for HTTP 429 status
    if (errorResponse?.status === 429) {
      return true;
    }
    
    // Check for specific error messages indicating quota exhaustion
    const quotaIndicators = [
      'credits exceeded',
      'quota exceeded',
      'rate limit',
      'too many requests',
      'CREDITS_EXCEEDED',
    ];
    
    return quotaIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Health check method to verify API connectivity and plan status
   * Useful for monitoring and debugging Business tier access
   */
  async healthCheck(): Promise<{ 
    connected: boolean; 
    isBusinessPlan: boolean; 
    error?: string 
  }> {
    try {
      // Query user information to check plan status
      const query = `
        query HealthCheck {
          me {
            id
            myDeveloperDetails {
              isBusinessPlan
              allowedOnDemandTranscriptsLimit
              currentOnDemandTranscriptsUsage
            }
          }
        }
      `;

      const result = await withHttpRetry(
        () => this.client.request(query),
        { maxAttempts: 1 } // Only one attempt for health checks
      );

      const userDetails = result.me?.myDeveloperDetails;
      
      logger.debug('Taddy Business health check completed', {
        isBusinessPlan: userDetails?.isBusinessPlan,
        transcriptLimit: userDetails?.allowedOnDemandTranscriptsLimit,
        transcriptUsage: userDetails?.currentOnDemandTranscriptsUsage,
      });

      return {
        connected: true,
        isBusinessPlan: userDetails?.isBusinessPlan || false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Taddy Business health check failed', {
        error: errorMessage,
      });

      return {
        connected: false,
        isBusinessPlan: false,
        error: errorMessage,
      };
    }
  }
} 