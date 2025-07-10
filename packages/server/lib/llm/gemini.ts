/**
 * Gemini 1.5 Flash Client Utility
 * 
 * Provides a simple interface for generating episode notes from podcast transcripts
 * and newsletter editions from episode notes using Google's Gemini 1.5 Flash model
 * via the AI Studio REST API.
 * 
 * @module gemini
 * @author Listener Team
 * @since 2025-01-27
 */

import { 
  buildNewsletterEditionPrompt, 
  sanitizeNewsletterContent
} from '../utils/buildNewsletterEditionPrompt';

// ===================================================================
// ENVIRONMENT VALIDATION
// ===================================================================

/**
 * Validate required environment variables at module load
 * Throws early if GEMINI_API_KEY is missing to fail fast
 */
function validateEnvironment(): void {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is required but not found in environment variables. ' +
      'Please set your Google AI Studio API key in .env file. ' +
      'Get your key at: https://aistudio.google.com/app/apikey'
    );
  }
  
  // Log configuration in debug mode (without exposing the key)
  if (process.env.DEBUG_API === 'true') {
    console.log('DEBUG: Gemini API key loaded:', apiKey.substring(0, 8) + '...');
    console.log('DEBUG: Gemini model:', getModelName());
  }
}

/**
 * Return the Gemini model identifier without a leading "models/" prefix so we
 * don't accidentally create a path like "models/models/...". If callers supply
 * the full path we strip it; otherwise we use the short default.
 */
function getModelName(): string {
  const raw = process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash-latest';
  // Remove any leading "models/" just in case.
  return raw.replace(/^models\//, '');
}

// Environment validation will be called when functions are used

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Result returned by generateEpisodeNotes function
 */
export interface EpisodeNotesResult {
  /** The generated episode notes/themes */
  notes: string;
  /** The Gemini model used for generation */
  model: string;
}

/**
 * Result returned by generateNewsletterEdition function
 */
export interface NewsletterEditionResult {
  /** The generated newsletter HTML content */
  htmlContent: string;
  /** The sanitized HTML content safe for email use */
  sanitizedContent: string;
  /** The Gemini model used for generation */
  model: string;
  /** Number of episode notes processed */
  episodeCount: number;
  /** Whether the generation was successful */
  success: boolean;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Optional prompt overrides for future extensibility
 * Currently unused but provides hook for customization
 */
export interface PromptOverrides {
  /** Custom system prompt */
  systemPrompt?: string;
  /** Temperature for response randomness (0.0-1.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

// ===================================================================
// ERROR HANDLING
// ===================================================================

/**
 * Custom error class for Gemini API failures
 * Provides structured error information for caller handling
 */
export class GeminiAPIError extends Error {
  /** HTTP status code from the API response */
  public readonly statusCode: number;
  /** Raw response body for debugging */
  public readonly responseBody: string;

  /**
   * Create a new GeminiAPIError
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param responseBody - Raw API response body
   */
  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = 'GeminiAPIError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    
    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GeminiAPIError);
    }
  }
}

// ===================================================================
// MAIN EXPORT FUNCTION
// ===================================================================

/**
 * Debug logging helper - only logs when DEBUG_API=true
 */
function debugLog(message: string, data?: any): void {
  if (process.env.DEBUG_API === 'true') {
    console.log(`[Gemini] ${message}`, data || '');
  }
}

/**
 * Generate episode notes from a podcast transcript using Gemini 1.5 Flash
 * 
 * @param transcript - The full episode transcript text
 * @param promptOverrides - Optional prompt customizations (future use)
 * @returns Promise resolving to generated notes and model info
 * @throws {GeminiAPIError} On API failures with status code and response details
 * @throws {Error} On network errors or invalid responses
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await generateEpisodeNotes(transcriptText);
 *   console.log('Notes:', result.notes);
 *   console.log('Model:', result.model);
 * } catch (error) {
 *   if (error instanceof GeminiAPIError) {
 *     console.error('API Error:', error.message, error.statusCode);
 *   }
 * }
 * ```
 */
export async function generateEpisodeNotes(
  transcript: string,
  promptOverrides?: Partial<PromptOverrides>
): Promise<EpisodeNotesResult> {
  // Validate environment and inputs
  validateEnvironment();
  
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('transcript must be a non-empty string');
  }

  const model = getModelName();
  const apiKey = process.env.GEMINI_API_KEY!; // Validated above
  const overrides = promptOverrides || {};
  
  // Build the default prompt for episode notes generation
  const defaultPrompt = `Please analyze the following podcast transcript and extract key topics, themes, and insights. Focus on:

1. **Main Topics Discussed**: What are the primary subjects covered?
2. **Key Insights & Takeaways**: What are the most valuable learnings?
3. **Notable Quotes or Moments**: Any particularly memorable or impactful statements?
4. **Emerging Themes**: What patterns or recurring ideas appear throughout?

Format your response as clear, well-organized bullet points grouped by category. Be concise but comprehensive.

Transcript:
${transcript}`;

  const prompt = overrides.systemPrompt || defaultPrompt;
  
  // Construct API endpoint URL
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  // Build request payload according to Gemini API format
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: overrides.temperature || 0.3,
      maxOutputTokens: overrides.maxTokens || 2048,
      topP: 0.8,
      topK: 40
    }
  };

  try {
    debugLog('Making request to Gemini API', { endpoint, model });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json() as any;
    
    if (!response.ok) {
      debugLog('Gemini API error response', { 
        status: response.status, 
        data: responseData 
      });
      
      throw new GeminiAPIError(
        `Gemini API request failed: ${responseData.error?.message || 'Unknown error'}`,
        response.status,
        JSON.stringify(responseData)
      );
    }

    // Extract the generated text from the response
    const candidates = responseData.candidates;
    if (!candidates || candidates.length === 0) {
      throw new GeminiAPIError(
        'No candidates returned from Gemini API',
        200,
        JSON.stringify(responseData)
      );
    }

    const content = candidates[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new GeminiAPIError(
        'No text content found in Gemini API response',
        200,
        JSON.stringify(responseData)
      );
    }

    debugLog('Successfully generated episode notes', { 
      model, 
      notesLength: content.length 
    });

    return {
      notes: content.trim(),
      model
    };

  } catch (error) {
    if (error instanceof GeminiAPIError) {
      throw error; // Re-throw our custom errors
    }
    
    // Handle network errors, JSON parsing errors, etc.
    debugLog('Unexpected error in generateEpisodeNotes', { error });
    throw new GeminiAPIError(
      `Unexpected error calling Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0,
      JSON.stringify({ originalError: error })
    );
  }
}

/**
 * Generate newsletter edition from episode notes using Gemini 1.5 Flash
 * 
 * This function takes episode notes and generates a complete newsletter edition
 * using the newsletter prompt template. It handles prompt building, API calls,
 * and content sanitization for safe email use.
 * 
 * @param episodeNotes - Array of episode notes text from episode_transcript_notes table
 * @param userEmail - User email for personalization
 * @param editionDate - Edition date in YYYY-MM-DD format
 * @param promptOverrides - Optional prompt customizations and generation settings
 * @returns Promise resolving to generated newsletter content and metadata
 * @throws {GeminiAPIError} On API failures with status code and response details
 * @throws {Error} On validation errors, network errors, or invalid responses
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await generateNewsletterEdition(
 *     episodeNotes,
 *     'user@example.com',
 *     '2025-01-27'
 *   );
 *   
 *   if (result.success) {
 *     console.log('Newsletter HTML:', result.htmlContent);
 *     console.log('Sanitized content:', result.sanitizedContent);
 *     console.log('Episode count:', result.episodeCount);
 *   } else {
 *     console.error('Generation failed:', result.error);
 *   }
 * } catch (error) {
 *   if (error instanceof GeminiAPIError) {
 *     console.error('API Error:', error.message, error.statusCode);
 *   }
 * }
 * ```
 */
export async function generateNewsletterEdition(
  episodeNotes: string[],
  userEmail: string,
  editionDate: string,
  promptOverrides?: Partial<PromptOverrides>
): Promise<NewsletterEditionResult> {
  // Validate environment first
  validateEnvironment();
  
  const startTime = Date.now();
  
  debugLog('Starting newsletter edition generation', {
    episodeCount: episodeNotes.length,
    userEmail: userEmail ? '***' + userEmail.slice(-4) : 'undefined',
    editionDate
  });

  try {
    // Validate inputs
    if (!episodeNotes || !Array.isArray(episodeNotes)) {
      throw new Error('episodeNotes must be a non-empty array');
    }

    if (episodeNotes.length === 0) {
      throw new Error('episodeNotes array cannot be empty - at least one episode note is required');
    }

    if (!userEmail || typeof userEmail !== 'string' || userEmail.trim() === '') {
      throw new Error('userEmail must be a non-empty string');
    }

    if (!editionDate || typeof editionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(editionDate)) {
      throw new Error('editionDate must be a valid YYYY-MM-DD string');
    }

    // Build the newsletter prompt using the prompt builder
    const promptResult = await buildNewsletterEditionPrompt({
      episodeNotes,
      userEmail,
      editionDate
    });

    if (!promptResult.success) {
      throw new Error(`Failed to build newsletter prompt: ${promptResult.error}`);
    }

    debugLog('Built newsletter prompt', {
      promptLength: promptResult.prompt.length,
      episodeCount: promptResult.episodeCount
    });

    // Get model and API configuration
    const model = getModelName();
    const apiKey = process.env.GEMINI_API_KEY!; // Validated above
    const overrides = promptOverrides || {};

    // Construct API endpoint URL
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Build request payload with newsletter-specific settings
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: promptResult.prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: overrides.temperature || 0.4, // Slightly higher for creative newsletter content
        maxOutputTokens: overrides.maxTokens || 4096, // Higher token limit for newsletter content
        topP: 0.9,
        topK: 40
      }
    };

    debugLog('Making newsletter request to Gemini API', { 
      endpoint, 
      model,
      temperature: requestBody.generationConfig.temperature,
      maxTokens: requestBody.generationConfig.maxOutputTokens
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json() as any;

    if (!response.ok) {
      debugLog('Gemini API error response for newsletter', { 
        status: response.status, 
        data: responseData 
      });
      
      throw new GeminiAPIError(
        `Gemini API request failed for newsletter generation: ${responseData.error?.message || 'Unknown error'}`,
        response.status,
        JSON.stringify(responseData)
      );
    }

    // Extract the generated HTML content from the response
    const candidates = responseData.candidates;
    if (!candidates || candidates.length === 0) {
      throw new GeminiAPIError(
        'No candidates returned from Gemini API for newsletter generation',
        200,
        JSON.stringify(responseData)
      );
    }

    const htmlContent = candidates[0]?.content?.parts?.[0]?.text;
    if (!htmlContent) {
      throw new GeminiAPIError(
        'No HTML content found in Gemini API response for newsletter generation',
        200,
        JSON.stringify(responseData)
      );
    }

    // Sanitize the HTML content for safe email use
    const sanitizedContent = sanitizeNewsletterContent(htmlContent);

    debugLog('Successfully generated newsletter edition', { 
      model, 
      htmlContentLength: htmlContent.length,
      sanitizedContentLength: sanitizedContent.length,
      episodeCount: promptResult.episodeCount,
      elapsedMs: Date.now() - startTime
    });

    return {
      htmlContent: htmlContent.trim(),
      sanitizedContent: sanitizedContent.trim(),
      model,
      episodeCount: promptResult.episodeCount,
      success: true
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    
    if (error instanceof GeminiAPIError) {
      debugLog('Gemini API error in newsletter generation', { 
        error: error.message, 
        statusCode: error.statusCode,
        elapsedMs 
      });
      // Return error result instead of throwing
      return {
        htmlContent: '',
        sanitizedContent: '',
        model: getModelName(),
        episodeCount: 0,
        success: false,
        error: error.message
      };
    }

    // Handle validation errors, network errors, JSON parsing errors, etc.
    debugLog('Unexpected error in generateNewsletterEdition', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsedMs 
    });

    // Return error result instead of throwing for better error handling
    return {
      htmlContent: '',
      sanitizedContent: '',
      model: getModelName(),
      episodeCount: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during newsletter generation'
    };
  }
} 