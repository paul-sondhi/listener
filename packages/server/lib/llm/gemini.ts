/**
 * Gemini 1.5 Flash Client Utility
 * 
 * Provides a simple interface for generating episode notes from podcast transcripts
 * using Google's Gemini 1.5 Flash model via the AI Studio REST API.
 * 
 * @module gemini
 * @author Listener Team
 * @since 2025-01-27
 */

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

// Validate environment on module load
validateEnvironment();

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
  // Validate inputs
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('transcript must be a non-empty string');
  }

  const model = getModelName();
  const apiKey = process.env.GEMINI_API_KEY!; // Already validated at module load
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