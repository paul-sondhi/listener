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
  userId: string; // Required by Taddy API for authentication
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
 * const client = new TaddyBusinessClient({ 
 *   apiKey: process.env.TADDY_API_KEY!,
 *   userId: process.env.TADDY_USER_ID!
 * });
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
        'X-USER-ID': this.config.userId, // Required by Taddy API
        'User-Agent': this.config.userAgent,
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    });

    logger.debug('TaddyBusinessClient initialized', {
      endpoint: this.config.endpoint,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey,
      hasUserId: !!this.config.userId,
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

      // Enhanced logging for Step 1
      logger.debug('Taddy Business: Step 1 - Podcast series lookup', {
        rssUrl: feedUrl,
        result: podcastResult ? 'found' : 'not_found',
        seriesUuid: podcastResult?.uuid,
        seriesName: podcastResult?.name,
        totalEpisodes: podcastResult?.totalEpisodesCount
      });

      if (!podcastResult) {
        logger.debug('No podcast series found for RSS URL', { 
          feedUrl,
          context: 'This would result in no_match status'
        });
        return { kind: 'no_match', creditsConsumed: 1 };
      }

      // Step 2: Look up the specific episode by GUID with retry logic
      const episodeResult = await withHttpRetry(
        () => this.queryPodcastEpisode(podcastResult.uuid, episodeGuid),
        { maxAttempts: 2 }
      );

      // Enhanced logging for Step 2
      logger.debug('Taddy Business: Step 2 - Episode lookup', {
        episodeGuid,
        podcastUuid: podcastResult.uuid,
        podcastName: podcastResult.name,
        result: episodeResult ? 'found' : 'not_found',
        episodeUuid: episodeResult?.uuid,
        episodeName: episodeResult?.name,
        transcribeStatus: episodeResult?.taddyTranscribeStatus,
        datePublished: episodeResult?.datePublished,
        duration: episodeResult?.duration
      });

      if (!episodeResult) {
        logger.debug('No episode found for GUID', { 
          episodeGuid, 
          podcastUuid: podcastResult.uuid,
          podcastName: podcastResult.name,
          context: 'This would result in no_match status'
        });
        return { kind: 'no_match', creditsConsumed: 1 };
      }

      // Step 3: Get transcript for the episode (may trigger generation)
      const transcriptResult = await withHttpRetry(
        () => this.queryEpisodeTranscript(episodeResult.uuid),
        { maxAttempts: 2 }
      );

      // Enhanced logging for Step 3
      logger.debug('Taddy Business: Step 3 - Transcript lookup', {
        episodeUuid: episodeResult.uuid,
        episodeName: episodeResult.name,
        result: transcriptResult ? 'found' : 'not_found',
        transcriptSegments: transcriptResult?.length || 0,
        hasText: transcriptResult && transcriptResult.length > 0,
        firstSegmentText: transcriptResult && transcriptResult.length > 0 ? 
          transcriptResult[0].text.substring(0, 100) + '...' : undefined
      });

      // Step 4: Classify transcript result and determine credits consumed
      // NOTE: Credit consumption is estimated since Taddy doesn't provide actual usage in headers
      const result = this.classifyBusinessTranscriptResult(transcriptResult, episodeResult);
      
      // Determine the specific failure reason for no_match results
      const failureReason = !podcastResult ? 'series_not_found' :
                           !episodeResult ? 'episode_not_found' :
                           !transcriptResult ? 'transcript_not_found' :
                           transcriptResult && transcriptResult.length === 0 ? 'transcript_empty' :
                           'unknown';
      
      const duration = Date.now() - startTime;
      logger.info('Taddy Business transcript lookup completed', {
        feedUrl,
        episodeGuid,
        result: result.kind,
        failure_reason: result.kind === 'no_match' ? failureReason : undefined,
        duration,
        creditsConsumed: result.creditsConsumed, // Estimated - may not reflect actual API usage
        wordCount: 'wordCount' in result ? result.wordCount : undefined,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for GraphQL schema validation errors (Task 2.3)
      if (error instanceof Error && (
        error.message.includes('Cannot query field') || 
        error.message.includes('Unknown argument') ||
        error.message.includes('GraphQL Error')
      )) {
        logger.error('GraphQL schema mismatch detected in Business client', { 
          feedUrl,
          episodeGuid,
          error: errorMessage,
          duration,
          context: 'This indicates the Taddy Business API schema has changed or our queries are incorrect'
        });
        
        return {
          kind: 'error',
          message: `SCHEMA_MISMATCH: ${errorMessage}`,
          creditsConsumed: 0,
        };
      }
      
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
   * 
   * ISSUE: The Taddy Business API schema shows getPodcastSeries has no arguments,
   * but we need to find a series by RSS URL. This is a fundamental API design issue.
   * 
   * OPTIONS:
   * 1. Use search API to find series by RSS URL
   * 2. The API might actually accept arguments despite schema
   * 3. Need to contact Taddy support for proper Business API documentation
   * 
   * For now, trying the original approach to see if it works despite schema mismatch.
   */
  private async queryPodcastSeries(rssUrl: string) {
    // ATTEMPT 1: Try the original approach (may work despite schema)
    const query = `
      query GetPodcastSeries($rssUrl: String!) {
        getPodcastSeries(rssUrl: $rssUrl) {
          uuid
          name
          rssUrl
        }
      }
    `;

    try {
      const result = await this.client.request(query, { rssUrl });
      return result.getPodcastSeries;
    } catch (error) {
      // If schema validation fails, log the issue and try alternative approaches
      if (error instanceof Error && error.message.includes('Cannot query field')) {
        logger.error('getPodcastSeries schema mismatch - trying search approach', {
          rssUrl,
          originalError: error.message
        });
        
        // ATTEMPT 2: Try using search API as fallback
        return this.searchForPodcastSeries(rssUrl);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Fallback method to find podcast series using search API
   * Used when direct getPodcastSeries fails due to schema issues
   */
  private async searchForPodcastSeries(rssUrl: string) {
    // Extract podcast name from RSS URL for search
    // This is a heuristic approach - may need refinement
    const searchTerm = this.extractPodcastNameFromUrl(rssUrl);
    
    logger.debug('Attempting podcast series search fallback', {
      rssUrl,
      searchTerm
    });
    
    const searchQuery = `
      query SearchPodcastSeries($searchTerm: String!) {
        search(searchTerm: $searchTerm) {
          podcastSeries {
            uuid
            name
            rssUrl
          }
        }
      }
    `;

    try {
      const result = await this.client.request(searchQuery, { searchTerm });
      const series = result.search?.podcastSeries;
      
      if (!series || series.length === 0) {
        logger.debug('No podcast series found via search', { searchTerm, rssUrl });
        return null;
      }

      // Find series with matching RSS URL
      const matchingSeries = series.find((s: any) => s.rssUrl === rssUrl);
      
      if (matchingSeries) {
        logger.debug('Found matching series via search', {
          seriesName: matchingSeries.name,
          seriesUuid: matchingSeries.uuid
        });
        return matchingSeries;
      }

      // Fallback: return first result if no exact RSS match
      logger.debug('No exact RSS match, using first search result', {
        searchTerm,
        resultCount: series.length,
        firstResult: series[0]?.name
      });
      
      return series[0];
      
    } catch (searchError) {
      logger.error('Search fallback also failed', {
        rssUrl,
        searchTerm,
        error: searchError instanceof Error ? searchError.message : String(searchError)
      });
      
      return null;
    }
  }

  /**
   * Extract podcast name from RSS URL for search purposes
   * This is a heuristic approach that may need refinement
   */
  private extractPodcastNameFromUrl(rssUrl: string): string {
    try {
      const url = new URL(rssUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      
      // Common patterns in podcast RSS URLs
      const lastPart = pathParts[pathParts.length - 1];
      
      // Remove common suffixes and convert to readable name
      const cleanName = lastPart
        .replace(/\.(xml|rss)$/i, '')
        .replace(/[-_]/g, ' ')
        .toLowerCase();
      
      return cleanName || 'podcast';
      
    } catch (_error) {
      // Fallback if URL parsing fails
      return 'podcast';
    }
  }

  /**
   * Query for podcast episode by GUID with fallback strategies
   * 
   * ATTEMPT 1: Direct episode query with seriesUuidForLookup (preferred approach)
   * ATTEMPT 2: Series lookup with client-side filtering (fallback)
   */
  private async queryPodcastEpisode(podcastUuid: string, episodeGuid: string) {
    // ATTEMPT 1: Direct episode query (preferred approach)
    try {
      const directQuery = `
        query GetPodcastEpisode($guid: String!, $seriesUuidForLookup: ID!) {
          getPodcastEpisode(guid: $guid, seriesUuidForLookup: $seriesUuidForLookup) {
            uuid
            name
            guid
            taddyTranscribeStatus
          }
        }
      `;

      const result = await this.client.request(directQuery, { 
        guid: episodeGuid,
        seriesUuidForLookup: podcastUuid
      });
      
      if (result.getPodcastEpisode) {
        logger.debug('Found episode via direct query', {
          episodeGuid,
          episodeUuid: result.getPodcastEpisode.uuid,
          episodeName: result.getPodcastEpisode.name,
          transcribeStatus: result.getPodcastEpisode.taddyTranscribeStatus
        });
        
        return result.getPodcastEpisode;
      }
      
      // Episode not found via direct query
      logger.debug('No episode found via direct query', { 
        episodeGuid,
        podcastUuid,
        context: 'This would result in no_match status'
      });
      return null;
      
    } catch (error) {
      // If direct query fails due to schema issues, fall back to series approach
      if (error instanceof Error && (
        error.message.includes('Cannot query field') ||
        error.message.includes('Unknown argument') ||
        error.message.includes('getPodcastEpisode')
      )) {
        logger.debug('Direct episode query failed, falling back to series lookup', {
          episodeGuid,
          podcastUuid,
          error: error.message
        });
        
        return this.queryPodcastEpisodeViaSeriesLookup(podcastUuid, episodeGuid);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Fallback method to find episode via series lookup when direct query fails
   */
  private async queryPodcastEpisodeViaSeriesLookup(podcastUuid: string, episodeGuid: string) {
    const query = `
      query GetPodcastSeriesWithEpisodes($podcastUuid: ID!) {
        getPodcastSeries(uuid: $podcastUuid) {
          uuid
          name
          rssUrl
          episodes {
            uuid
            name
            guid
            taddyTranscribeStatus
          }
        }
      }
    `;

    const result = await this.client.request(query, { podcastUuid });
    const series = result.getPodcastSeries;
    
    if (!series) {
      logger.debug('No podcast series found for UUID', { 
        podcastUuid,
        context: 'This would result in no_match status'
      });
      return null;
    }

    if (!series.episodes || series.episodes.length === 0) {
      logger.debug('Podcast series has no episodes', { 
        podcastUuid, 
        seriesName: series.name,
        context: 'This would result in no_match status'
      });
      return null;
    }

    // Filter episodes by GUID (client-side)
    const matchingEpisode = series.episodes.find((episode: any) => 
      episode.guid === episodeGuid
    );

    if (!matchingEpisode) {
      logger.debug('No episode found with matching GUID via series lookup', { 
        podcastUuid, 
        episodeGuid,
        seriesName: series.name,
        availableEpisodes: series.episodes.length,
        context: 'This would result in no_match status',
        availableGuids: series.episodes.slice(0, 3).map((e: any) => e.guid) // Log first 3 GUIDs for debugging
      });
      return null;
    }

    logger.debug('Found matching episode via series lookup fallback', {
      podcastUuid,
      episodeGuid,
      episodeUuid: matchingEpisode.uuid,
      episodeName: matchingEpisode.name,
      transcribeStatus: matchingEpisode.taddyTranscribeStatus
    });

    return matchingEpisode;
  }

  /**
   * Query for episode transcript by episode UUID
   * This may trigger transcript generation for Business tier clients
   */
  private async queryEpisodeTranscript(episodeUuid: string) {
    const query = `
      query GetEpisodeTranscript($episodeUuid: ID!) {
        getEpisodeTranscript(uuid: $episodeUuid, useOnDemandCreditsIfNeeded: true) {
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
   * 
   * NOTE: Taddy API doesn't provide actual credit consumption in response headers.
   * According to their documentation, cached responses don't consume credits, but
   * we have no way to detect this from the API response. This method estimates
   * credit consumption based on request patterns, but may not be 100% accurate.
   */
  private classifyBusinessTranscriptResult(
    transcriptItems: TaddyTranscriptItem[] | null,
    episodeInfo: any,
    requestMetadata?: { isLikelyCached?: boolean }
  ): BusinessTranscriptResult {
    // Estimate credit consumption based on available information
    // NOTE: This is an approximation since Taddy doesn't provide real credit info
    const estimatedCredits = this.estimateCreditConsumption(requestMetadata);

    // Check if transcript is still being processed
    if (episodeInfo?.taddyTranscribeStatus === 'PROCESSING') {
      logger.debug('Episode transcript is still processing', {
        episodeUuid: episodeInfo.uuid,
        status: episodeInfo.taddyTranscribeStatus,
      });
      
      return {
        kind: 'processing',
        source: 'taddy',
        creditsConsumed: estimatedCredits,
      };
    }

    // Check if transcript generation failed
    if (episodeInfo?.taddyTranscribeStatus === 'FAILED') {
      logger.debug('Episode transcript generation failed', {
        episodeUuid: episodeInfo.uuid,
        status: episodeInfo.taddyTranscribeStatus,
      });
      
      return {
        kind: 'error',
        message: 'taddyTranscribeStatus=FAILED',
        creditsConsumed: estimatedCredits,
      };
    }

    // No transcript items returned
    if (!transcriptItems || transcriptItems.length === 0) {
      logger.debug('No transcript items found for episode', {
        episodeUuid: episodeInfo.uuid,
      });
      
      return {
        kind: 'not_found',
        creditsConsumed: estimatedCredits,
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
        creditsConsumed: estimatedCredits,
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
        creditsConsumed: estimatedCredits,
      };
    }
  }

  /**
   * Estimates credit consumption for a request
   * 
   * Since Taddy API doesn't provide actual credit consumption in response headers,
   * this method provides a best-effort estimate based on available information.
   * 
   * According to Taddy documentation:
   * - Cached responses don't consume credits
   * - Fresh requests consume 1 credit
   * 
   * Without response headers, we can't definitively know if a response was cached,
   * so this method makes educated guesses based on request patterns and timing.
   */
  private estimateCreditConsumption(requestMetadata?: { isLikelyCached?: boolean }): number {
    // If we have explicit cache information, use it
    if (requestMetadata?.isLikelyCached === true) {
      return 0;
    }
    
    if (requestMetadata?.isLikelyCached === false) {
      return 1;
    }
    
    // Default assumption: most requests consume 1 credit
    // This errs on the side of over-reporting rather than under-reporting
    // which is better for quota management and user expectations
    return 1;
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