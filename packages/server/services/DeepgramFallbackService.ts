/**
 * DeepgramFallbackService - Provides transcript fallback using Deepgram's URL transcription API
 * 
 * This service is used when Taddy fails to provide transcripts for episodes.
 * It transcribes directly from episode URLs using Deepgram's pre-recorded API.
 */

import { createClient, DeepgramClient } from '@deepgram/sdk';

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
}

/**
 * Service for handling Deepgram fallback transcriptions
 */
export class DeepgramFallbackService {
  private client: DeepgramClient;
  private config: DeepgramFallbackConfig;

  constructor(config?: Partial<DeepgramFallbackConfig>) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is required');
    }

    this.client = createClient(apiKey);
    
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

    console.log('[DEEPGRAM_FALLBACK] Service initialized with config:', {
      maxFileSizeMB: this.config.maxDeepgramFileSizeMB,
      model: this.config.deepgramOptions.model,
    });
  }

  /**
   * Transcribe an episode from its URL using Deepgram
   * @param episodeUrl - Direct URL to the episode audio file
   * @returns Promise<DeepgramTranscriptResult> - Transcription result
   */
  async transcribeFromUrl(episodeUrl: string): Promise<DeepgramTranscriptResult> {
    const startTime = Date.now();
    
    console.log('[DEEPGRAM_FALLBACK] Starting transcription for URL:', episodeUrl);

    try {
      // Step 1: Validate URL format
      if (!this.isValidUrl(episodeUrl)) {
        const error = `Invalid URL format: ${episodeUrl}`;
        console.log('[DEEPGRAM_FALLBACK] URL validation failed:', error);
        return { success: false, error };
      }

      // Step 2: Check file size via HEAD request
      const fileSizeCheck = await this.checkFileSize(episodeUrl);
      if (!fileSizeCheck.success) {
        console.log('[DEEPGRAM_FALLBACK] File size check failed:', fileSizeCheck.error);
        return fileSizeCheck;
      }

      console.log('[DEEPGRAM_FALLBACK] File size check passed:', `${fileSizeCheck.fileSizeMB}MB`);

      // Step 3: Attempt transcription with Deepgram
      const { result, error } = await this.client.listen.prerecorded.transcribeUrl(
        { url: episodeUrl },
        this.config.deepgramOptions
      );

      if (error) {
        const errorMessage = `Deepgram API error: ${error.message || 'Unknown error'}`;
        console.error('[DEEPGRAM_FALLBACK] Deepgram API error:', error);
        return { success: false, error: errorMessage, fileSizeMB: fileSizeCheck.fileSizeMB };
      }

      // Step 4: Extract transcript from response
      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      
      if (!transcript) {
        const error = 'No transcript returned from Deepgram API';
        console.error('[DEEPGRAM_FALLBACK] No transcript in response:', result);
        return { success: false, error, fileSizeMB: fileSizeCheck.fileSizeMB };
      }

      const duration = Date.now() - startTime;
      console.log('[DEEPGRAM_FALLBACK] Transcription successful:', {
        fileSizeMB: fileSizeCheck.fileSizeMB,
        transcriptLength: transcript.length,
        durationMs: duration
      });

      return {
        success: true,
        transcript,
        fileSizeMB: fileSizeCheck.fileSizeMB
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown transcription error';
      
      console.error('[DEEPGRAM_FALLBACK] Transcription failed:', {
        error: errorMessage,
        url: episodeUrl,
        durationMs: duration
      });

      // Handle specific error types
      if (errorMessage.includes('429')) {
        return { success: false, error: 'Rate limit exceeded - too many concurrent requests' };
      }
      
      if (errorMessage.includes('504') || errorMessage.includes('timeout')) {
        return { success: false, error: 'Transcription timeout - file processing exceeded 10 minutes' };
      }

      return { success: false, error: errorMessage };
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
      console.log('[DEEPGRAM_FALLBACK] Checking file size for:', url);
      
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
      console.error('[DEEPGRAM_FALLBACK] File size check error:', errorMessage);
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