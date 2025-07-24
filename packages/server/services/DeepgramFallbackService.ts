/**
 * DeepgramFallbackService - Provides transcript fallback using Deepgram's URL transcription API
 * 
 * This service is used when Taddy fails to provide transcripts for episodes.
 * It transcribes directly from episode URLs using Deepgram's pre-recorded API.
 */

import { createClient, DeepgramClient } from '@deepgram/sdk';
import { Logger } from '../lib/logger.js';

/**
 * Configuration interface for Deepgram fallback service
 */
export interface DeepgramFallbackConfig {
  /** Maximum file size in megabytes to attempt transcription */
  maxDeepgramFileSizeMB: number;
  /** Deepgram API options */
  deepgramOptions: {
    model: string;
    smart_format: boolean;
    diarize: boolean;
    filler_words: boolean;
  };
}

/**
 * Result of a Deepgram transcription attempt
 */
export interface DeepgramTranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
  fileSizeMB?: number;
  processingTimeMs?: number;
}

/**
 * Service for handling Deepgram fallback transcriptions
 */
export class DeepgramFallbackService {
  private client: DeepgramClient;
  private config: DeepgramFallbackConfig;
  private logger: Logger;

  constructor(config?: Partial<DeepgramFallbackConfig>, logger?: Logger) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is required');
    }

    this.client = createClient(apiKey);
    this.logger = logger || console as any; // Fallback to console if no logger provided
    
    // Set default configuration with overrides
    this.config = {
      maxDeepgramFileSizeMB: 500, // Conservative default
      deepgramOptions: {
        model: 'nova-3',        // Latest and most accurate model
        smart_format: true,     // Adds punctuation, paragraphs, formats dates/times
        diarize: true,         // Identifies different speakers (essential for podcasts)
        filler_words: false,   // Omit "um", "uh" for cleaner transcripts
      },
      ...config
    };

    this.logger.info('system', 'Deepgram fallback service initialized', {
      metadata: {
        max_file_size_mb: this.config.maxDeepgramFileSizeMB,
        model: this.config.deepgramOptions.model,
        smart_format: this.config.deepgramOptions.smart_format,
        diarize: this.config.deepgramOptions.diarize,
        filler_words: this.config.deepgramOptions.filler_words
      }
    });
  }

  /**
   * Transcribe an episode from its URL using Deepgram
   * @param episodeUrl - Direct URL to the episode audio file
   * @returns Promise<DeepgramTranscriptResult> - Transcription result
   */
  async transcribeFromUrl(episodeUrl: string): Promise<DeepgramTranscriptResult> {
    const startTime = Date.now();
    
    this.logger.info('system', 'Starting Deepgram transcription', {
      metadata: {
        episode_url: episodeUrl,
        timestamp: new Date().toISOString()
      }
    });

    try {
      // Step 1: Validate URL format
      if (!this.isValidUrl(episodeUrl)) {
        const error = `Invalid URL format: ${episodeUrl}`;
        const processingTimeMs = Date.now() - startTime;
        
        this.logger.warn('system', 'Deepgram URL validation failed', {
          metadata: {
            episode_url: episodeUrl,
            error: error,
            processing_time_ms: processingTimeMs
          }
        });
        
        return { success: false, error, processingTimeMs };
      }

      // Step 2: Check file size via HEAD request
      const fileSizeCheck = await this.checkFileSize(episodeUrl);
      if (!fileSizeCheck.success) {
        const processingTimeMs = Date.now() - startTime;
        
        this.logger.warn('system', 'Deepgram file size check failed', {
          metadata: {
            episode_url: episodeUrl,
            error: fileSizeCheck.error,
            file_size_mb: fileSizeCheck.fileSizeMB,
            processing_time_ms: processingTimeMs
          }
        });
        
        return { ...fileSizeCheck, processingTimeMs };
      }

      this.logger.debug('system', 'Deepgram file size check passed', {
        metadata: {
          episode_url: episodeUrl,
          file_size_mb: fileSizeCheck.fileSizeMB
        }
      });

      // Step 3: Attempt transcription with Deepgram
      const { result, error } = await this.client.listen.prerecorded.transcribeUrl(
        { url: episodeUrl },
        this.config.deepgramOptions
      );

      if (error) {
        const processingTimeMs = Date.now() - startTime;
        const errorMessage = `Deepgram API error: ${error.message || 'Unknown error'}`;
        
        this.logger.error('system', 'Deepgram API error', {
          metadata: {
            episode_url: episodeUrl,
            error: error.message || 'Unknown error',
            error_code: error.code || 'unknown',
            file_size_mb: fileSizeCheck.fileSizeMB,
            processing_time_ms: processingTimeMs
          }
        });
        
        return { success: false, error: errorMessage, fileSizeMB: fileSizeCheck.fileSizeMB, processingTimeMs };
      }

      // Step 4: Extract transcript from response
      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      
      if (!transcript) {
        const processingTimeMs = Date.now() - startTime;
        const error = 'Invalid response structure from Deepgram API';
        
        this.logger.error('system', 'Deepgram response missing transcript', {
          metadata: {
            episode_url: episodeUrl,
            error: error,
            response_structure: {
              has_results: !!result?.results,
              has_channels: !!result?.results?.channels,
              channels_count: result?.results?.channels?.length || 0
            },
            file_size_mb: fileSizeCheck.fileSizeMB,
            processing_time_ms: processingTimeMs
          }
        });
        
        return { success: false, error, fileSizeMB: fileSizeCheck.fileSizeMB, processingTimeMs };
      }

      const processingTimeMs = Date.now() - startTime;
      
      this.logger.info('system', 'Deepgram transcription successful', {
        metadata: {
          episode_url: episodeUrl,
          file_size_mb: fileSizeCheck.fileSizeMB,
          transcript_length: transcript.length,
          processing_time_ms: processingTimeMs,
          estimated_duration_minutes: Math.round(processingTimeMs / 60000 * 100) / 100
        }
      });

      return {
        success: true,
        transcript,
        fileSizeMB: fileSizeCheck.fileSizeMB,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown transcription error';
      
      this.logger.error('system', 'Deepgram transcription exception', {
        metadata: {
          episode_url: episodeUrl,
          error: errorMessage,
          error_type: error instanceof Error ? error.constructor.name : 'unknown',
          processing_time_ms: processingTimeMs
        }
      });

      // Handle specific error types
      if (errorMessage.includes('429')) {
        return { 
          success: false, 
          error: 'Rate limit exceeded - too many concurrent requests', 
          processingTimeMs 
        };
      }
      
      if (errorMessage.includes('504') || errorMessage.includes('timeout')) {
        return { 
          success: false, 
          error: 'Transcription timeout - file processing exceeded 10 minutes', 
          processingTimeMs 
        };
      }

      return { success: false, error: errorMessage, processingTimeMs };
    }
  }

  /**
   * Validate if a URL is properly formatted and uses HTTP/HTTPS
   * @param url - URL to validate
   * @returns boolean - true if valid
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check file size via HEAD request to ensure it's within limits
   * @param url - URL to check
   * @returns Promise<DeepgramTranscriptResult> - Size check result
   */
  private async checkFileSize(url: string): Promise<DeepgramTranscriptResult> {
    try {
      this.logger.debug('system', 'Checking file size via HEAD request', {
        metadata: {
          episode_url: url
        }
      });
      
      const headResponse = await fetch(url, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Listener-Podcast-App/1.0'
        }
      });

      if (!headResponse.ok) {
        const error = `HEAD request failed: ${headResponse.status} ${headResponse.statusText}`;
        return { success: false, error };
      }

      const contentLength = headResponse.headers.get('content-length');
      if (!contentLength) {
        const error = 'Missing Content-Length header - cannot verify file size';
        return { success: false, error };
      }

      const fileSizeBytes = parseInt(contentLength, 10);
      if (isNaN(fileSizeBytes) || fileSizeBytes <= 0) {
        const error = `Invalid Content-Length header: ${contentLength}`;
        return { success: false, error };
      }

      const fileSizeMB = fileSizeBytes / (1024 * 1024);
      
      if (fileSizeMB > this.config.maxDeepgramFileSizeMB) {
        const error = `File size ${fileSizeMB.toFixed(1)}MB exceeds limit of ${this.config.maxDeepgramFileSizeMB}MB`;
        return { success: false, error, fileSizeMB };
      }

      return { success: true, fileSizeMB };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during file size check';
      
      this.logger.error('system', 'File size check network error', {
        metadata: {
          episode_url: url,
          error: errorMessage,
          error_type: error instanceof Error ? error.constructor.name : 'unknown'
        }
      });
      
      return { success: false, error: `Network error during file size check: ${errorMessage}` };
    }
  }

  /**
   * Get current configuration
   * @returns DeepgramFallbackConfig - Current configuration
   */
  getConfig(): DeepgramFallbackConfig {
    return { ...this.config };
  }
}