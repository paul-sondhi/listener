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
  sanitizeNewsletterContent,
  EpisodeMetadata
} from '../utils/buildNewsletterEditionPrompt';

// Gemini API response types
interface GeminiCandidate {
  content: {
    parts: Array<{
      text: string;
    }>;
    role: string;
  };
  finishReason: string;
  index: number;
  safetyRatings: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  };
  error?: {
    message: string;
    code?: number;
    status?: string;
  };
}

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
  /** Maximum tokens to generate (output tokens) */
  maxOutputTokens?: number;
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
// RATE LIMITING
// ===================================================================

/**
 * Global rate limiter for Gemini API requests
 * Uses request scheduling to enforce 2-second intervals between API calls
 * Works correctly with concurrent requests by assigning each request a scheduled time slot
 */
class GeminiRateLimiter {
  private static instance: GeminiRateLimiter;
  private nextAvailableTime = 0;
  private readonly requestInterval = 2000; // 2 seconds between requests
  private readonly idleResetThreshold = 300000; // 5 minutes - reset scheduler after idle period

  static getInstance(): GeminiRateLimiter {
    if (!GeminiRateLimiter.instance) {
      GeminiRateLimiter.instance = new GeminiRateLimiter();
    }
    return GeminiRateLimiter.instance;
  }

  async throttleRequest(): Promise<void> {
    const now = Date.now();
    
    // Reset scheduler if we've been idle for too long
    if (now - this.nextAvailableTime > this.idleResetThreshold) {
      this.nextAvailableTime = now;
    }
    
    // Assign this request the next available time slot
    const myScheduledTime = Math.max(this.nextAvailableTime, now);
    
    // Reserve the next slot for the following request
    this.nextAvailableTime = myScheduledTime + this.requestInterval;
    
    // Wait until our scheduled time
    const waitTime = myScheduledTime - now;
    if (waitTime > 0) {
      // Log throttling at info level for visibility
      console.log(`[Gemini] Throttling request - waiting ${waitTime}ms before API call`);
      
      await this.sleep(waitTime);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===================================================================
// VALIDATION
// ===================================================================

/**
 * Validates that generated newsletter content matches expected structure
 * Based on the template defined in prompts/newsletter-edition.md
 * 
 * @param htmlContent - The generated HTML content to validate
 * @param episodeCount - Number of episodes included in the newsletter
 * @returns Validation result with specific issues if invalid
 */
export function validateNewsletterStructure(htmlContent: string, _episodeCount: number): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // 1. Check required HTML structure
  if (!htmlContent.includes('<!DOCTYPE html>')) {
    issues.push('Missing DOCTYPE declaration');
  }
  if (!htmlContent.includes('<html lang="en">')) {
    issues.push('Missing or incorrect html tag');
  }
  if (!htmlContent.includes('</html>')) {
    issues.push('Unclosed html tag');
  }
  if (!htmlContent.includes('</body>')) {
    issues.push('Unclosed body tag');
  }
  if (!htmlContent.includes('</table>')) {
    issues.push('Unclosed table tag');
  }
  
  // Check for any unclosed td tags
  const tdOpenCount = (htmlContent.match(/<td[^>]*>/g) || []).length;
  const tdCloseCount = (htmlContent.match(/<\/td>/g) || []).length;
  if (tdOpenCount !== tdCloseCount) {
    issues.push(`Unclosed td tags (${tdOpenCount} open, ${tdCloseCount} closed)`);
  }
  
  // 2. Check required sections exist and are complete
  const requiredSections = [
    { pattern: /Hello! I listened to \d+ episode/i, name: 'Intro' },
    { pattern: /Recommended Listens/i, name: 'Recommended Listens heading' },
    { pattern: /Today I Learned/i, name: 'Today I Learned heading' },
    { pattern: /Happy listening! 🎧/, name: 'Closing' },
    { pattern: /P\.S\. Got feedback\?/i, name: 'P.S. section' }
  ];
  
  for (const section of requiredSections) {
    if (!section.pattern.test(htmlContent)) {
      issues.push(`Missing ${section.name}`);
    }
  }
  
  // 3. Check that last paragraph closes properly
  const lastParagraphIndex = htmlContent.lastIndexOf('<p');
  if (lastParagraphIndex > -1) {
    const afterLastP = htmlContent.substring(lastParagraphIndex);
    if (!afterLastP.includes('</p>')) {
      issues.push('Last paragraph not closed properly');
    }
  }
  
  // 4. Check for mid-sentence truncation
  // Extract text content without HTML tags
  const textContent = htmlContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style blocks
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Check if content ends properly (with punctuation or emoji)
  const lastChar = textContent[textContent.length - 1];
  const endsWithPunctuation = ['.', '!', '?', '"', ')', ']', '🎧', '📧'].includes(lastChar);
  
  // Also check the last few characters for common ending patterns
  const lastFewChars = textContent.slice(-10);
  const hasProperEnding = endsWithPunctuation || 
    lastFewChars.includes('let me know') || 
    lastFewChars.includes('feedback');
  
  if (!hasProperEnding && textContent.length > 0) {
    // Get last 50 characters for context in error message
    const context = textContent.slice(-50);
    issues.push(`Content appears truncated mid-sentence. Ends with: "${context}"`);
  }
  
  // 5. Minimum content check
  const minContentLength = 3000; // Minimum expected length
  if (htmlContent.length < minContentLength) {
    issues.push(`Content too short: ${htmlContent.length} chars (minimum ${minContentLength})`);
  }
  
  // 6. Check for incomplete HTML structure at the end
  const htmlEnding = htmlContent.slice(-100).toLowerCase();
  if (!htmlEnding.includes('</html>') || !htmlEnding.includes('</body>')) {
    issues.push('HTML document not properly closed at the end');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

// ===================================================================
// MAIN EXPORT FUNCTION
// ===================================================================

/**
 * Debug logging helper - only logs when DEBUG_API=true
 */
function debugLog(message: string, data?: unknown): void {
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

  // Apply rate limiting before making API request (skip in tests)
  if (process.env.NODE_ENV !== 'test') {
    await GeminiRateLimiter.getInstance().throttleRequest();
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
      maxOutputTokens: overrides.maxOutputTokens ?? 8192,
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

    const responseData = await response.json() as GeminiResponse;
    
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
 *     '2025-01-27',
 *     episodeMetadata
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
  episodeMetadata: EpisodeMetadata[],
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
    // Apply rate limiting before making API request (skip in tests)
    if (process.env.NODE_ENV !== 'test') {
      await GeminiRateLimiter.getInstance().throttleRequest();
    }
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
      editionDate,
      episodeMetadata
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
        maxOutputTokens: overrides.maxOutputTokens ?? 16384, // Increased token limit to prevent truncation
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

    const responseData = await response.json() as GeminiResponse;

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

    // Validate the generated content structure
    const validation = validateNewsletterStructure(htmlContent, promptResult.episodeCount);
    
    if (!validation.isValid) {
      debugLog('Generated newsletter failed validation', {
        issues: validation.issues,
        htmlContentLength: htmlContent.length,
        episodeCount: promptResult.episodeCount
      });
      
      throw new GeminiAPIError(
        `Generated newsletter failed validation: ${validation.issues.join(', ')}`,
        200,
        JSON.stringify({ 
          validation,
          contentLength: htmlContent.length,
          episodeCount: promptResult.episodeCount
        })
      );
    }

    // Sanitize the HTML content for safe email use
    const sanitizedContent = sanitizeNewsletterContent(htmlContent);

    debugLog('Successfully generated newsletter edition', { 
      model, 
      htmlContentLength: htmlContent.length,
      sanitizedContentLength: sanitizedContent.length,
      episodeCount: promptResult.episodeCount,
      elapsedMs: Date.now() - startTime,
      validationPassed: true
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