/**
 * Newsletter Edition Prompt Builder
 * 
 * High-level functions for building newsletter edition prompts from episode notes
 * using the newsletter edition prompt template. This module provides utilities for:
 * 
 * - Loading and validating newsletter prompt templates
 * - Building formatted prompts from episode notes arrays
 * - Handling edge cases (empty arrays, single notes, multiple notes)
 * - Validating episode notes for quality and completeness
 * - Sanitizing HTML content for safe email use
 * 
 * The module supports both simple and parameterized function signatures for flexibility.
 * All functions include comprehensive error handling and debug logging.
 * 
 * @module buildNewsletterEditionPrompt
 * @author Listener Team
 * @since 2025-01-27
 * 
 * @example
 * ```typescript
 * // Simple usage
 * const result = await buildNewsletterEditionPrompt(
 *   episodeNotes,
 *   'user@example.com',
 *   '2025-01-27'
 * );
 * 
 * // Advanced usage with custom template
 * const result = await buildNewsletterEditionPrompt({
 *   episodeNotes,
 *   userEmail: 'user@example.com',
 *   editionDate: '2025-01-27',
 *   promptTemplatePath: 'custom/newsletter-template.md'
 * });
 * 
 * if (result.success) {
 *   console.log('Generated prompt:', result.prompt);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import sanitizeHtml from 'sanitize-html';

/**
 * Metadata for a single episode
 */
export interface EpisodeMetadata {
  /** The podcast show title */
  showTitle: string;
  /** The Spotify URL for the podcast show */
  spotifyUrl: string;
}

/**
 * Parameters for building a newsletter edition prompt
 * 
 * This interface defines all parameters needed to build a newsletter edition prompt.
 * All parameters are validated before processing to ensure data quality.
 * 
 * @interface BuildNewsletterPromptParams
 */
export interface BuildNewsletterPromptParams {
  /** 
   * Array of episode notes text from the episode_transcript_notes table.
   * Must be a non-empty array of valid strings.
   * Each note should contain structured episode content (topics, insights, quotes, etc.).
   */
  episodeNotes: string[];
  
  /** 
   * User email address for personalization in the newsletter.
   * Must be a non-empty string and will be included in the prompt template.
   */
  userEmail: string;
  
  /** 
   * Edition date in YYYY-MM-DD format (e.g., '2025-01-27').
   * Must match the regex pattern /^\d{4}-\d{2}-\d{2}$/.
   * Used for context and timeliness in the newsletter.
   */
  editionDate: string;
  
  /** 
   * Optional custom path to the prompt template file.
   * Defaults to 'prompts/newsletter-edition.md' if not provided.
   * Must be a valid file path relative to the project root.
   */
  promptTemplatePath?: string;
  
  /**
   * Required metadata for each episode corresponding to the episodeNotes array.
   * Must have the same length as episodeNotes array.
   * Required for accurate podcast show names and Spotify URLs.
   */
  episodeMetadata: EpisodeMetadata[];
}

/**
 * Result of building a newsletter edition prompt
 * 
 * This interface defines the structure of the result returned by the prompt builder.
 * The result includes both success and error states with appropriate data.
 * 
 * @interface NewsletterPromptResult
 */
export interface NewsletterPromptResult {
  /** 
   * The formatted prompt ready for LLM generation.
   * Contains the complete prompt with all placeholders replaced and episode notes included.
   * Empty string if prompt building failed.
   */
  prompt: string;
  
  /** 
   * The prompt template used for generation.
   * Contains the raw template content loaded from the template file.
   * Empty string if template loading failed.
   */
  template: string;
  
  /** 
   * Number of episode notes processed in the prompt.
   * Reflects the final count after filtering out invalid notes.
   * Zero if prompt building failed.
   */
  episodeCount: number;
  
  /** 
   * Whether the prompt building was successful.
   * True if prompt was built successfully, false if any error occurred.
   */
  success: boolean;
  
  /** 
   * Error message if prompt building failed.
   * Contains a descriptive error message explaining what went wrong.
   * Undefined if prompt building was successful.
   */
  error?: string;
}

/**
 * Build a newsletter edition prompt from episode notes (simple signature)
 * 
 * This function loads the newsletter prompt template and combines it with
 * episode notes to create a formatted prompt for newsletter generation.
 * 
 * @param episodeNotes - Array of episode notes text from episode_transcript_notes table
 * @param userEmail - User email for personalization in the newsletter
 * @param editionDate - Edition date in YYYY-MM-DD format
 * @returns Promise<NewsletterPromptResult> - Prompt building result with success/error state
 * @throws {Error} If userEmail or editionDate are missing when using simple signature
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await buildNewsletterEditionPrompt(
 *     ['Episode note 1 content...', 'Episode note 2 content...'],
 *     'user@example.com',
 *     '2025-01-27'
 *   );
 *   
 *   if (result.success) {
 *     console.log('Generated prompt:', result.prompt);
 *     console.log('Episode count:', result.episodeCount);
 *   } else {
 *     console.error('Failed to build prompt:', result.error);
 *   }
 * } catch (error) {
 *   console.error('Unexpected error:', error.message);
 * }
 * ```
 */
export async function buildNewsletterEditionPrompt(
  episodeNotes: string[],
  userEmail: string,
  editionDate: string
): Promise<NewsletterPromptResult>;

/**
 * Build a newsletter edition prompt from episode notes (implementation)
 * 
 * This function loads the newsletter prompt template and combines it with
 * episode notes to create a formatted prompt for newsletter generation.
 * Supports both simple and parameterized function signatures.
 * 
 * @param episodeNotesOrParams - Either episode notes array or full parameters object
 * @param userEmail - User email for personalization (when using simple signature)
 * @param editionDate - Edition date in YYYY-MM-DD format (when using simple signature)
 * @returns Promise<NewsletterPromptResult> - Prompt building result with success/error state
 * @throws {Error} For various validation failures:
 *   - Missing userEmail or editionDate in simple signature
 *   - Invalid episodeNotes array (empty, null, or non-array)
 *   - Invalid userEmail (empty or non-string)
 *   - Invalid editionDate format (must be YYYY-MM-DD)
 *   - All episode notes are empty or invalid
 *   - Template file not found or invalid
 * 
 * @example
 * ```typescript
 * // Both signatures are supported:
 * 
 * // Simple signature
 * const result1 = await buildNewsletterEditionPrompt(
 *   episodeNotes, 'user@example.com', '2025-01-27'
 * );
 * 
 * // Params signature
 * const result2 = await buildNewsletterEditionPrompt({
 *   episodeNotes, userEmail: 'user@example.com', editionDate: '2025-01-27'
 * });
 * 
 * // Check result
 * if (result1.success) {
 *   console.log('Success:', result1.prompt);
 * } else {
 *   console.error('Error:', result1.error);
 * }
 * ```
 */
export async function buildNewsletterEditionPrompt(
  episodeNotesOrParams: string[] | BuildNewsletterPromptParams,
  userEmail?: string,
  editionDate?: string
): Promise<NewsletterPromptResult> {
  // Handle function overloads
  let params: BuildNewsletterPromptParams;
  
  if (Array.isArray(episodeNotesOrParams)) {
    // Simple signature: buildNewsletterEditionPrompt(episodeNotes, userEmail, editionDate)
    if (!userEmail || !editionDate) {
      throw new Error('userEmail and editionDate are required when using simple function signature');
    }
    params = {
      episodeNotes: episodeNotesOrParams,
      userEmail,
      editionDate
    };
  } else {
    // Params signature: buildNewsletterEditionPrompt(params)
    params = episodeNotesOrParams;
  }

  const startTime = Date.now();
  
  console.log('DEBUG: Building newsletter edition prompt', {
    episodeCount: params.episodeNotes.length,
    userEmail: params.userEmail,
    editionDate: params.editionDate,
    promptTemplatePath: params.promptTemplatePath || 'prompts/newsletter-edition.md'
  });

  try {
    // Validate inputs with enhanced edge case handling
    if (!params.episodeNotes || !Array.isArray(params.episodeNotes)) {
      throw new Error('episodeNotes must be a non-empty array');
    }

    // Handle empty array case
    if (params.episodeNotes.length === 0) {
      throw new Error('episodeNotes array cannot be empty - at least one episode note is required');
    }
    
    // Validate required metadata
    if (!params.episodeMetadata || !Array.isArray(params.episodeMetadata)) {
      throw new Error('episodeMetadata must be an array');
    }
    
    if (params.episodeMetadata.length !== params.episodeNotes.length) {
      throw new Error(`episodeMetadata length (${params.episodeMetadata.length}) must match episodeNotes length (${params.episodeNotes.length})`);
    }
    
    // Validate each metadata entry
    params.episodeMetadata.forEach((metadata, index) => {
      if (!metadata || typeof metadata !== 'object') {
        throw new Error(`episodeMetadata[${index}] must be an object`);
      }
      if (!metadata.showTitle || typeof metadata.showTitle !== 'string') {
        throw new Error(`episodeMetadata[${index}].showTitle must be a non-empty string`);
      }
      if (!metadata.spotifyUrl || typeof metadata.spotifyUrl !== 'string') {
        throw new Error(`episodeMetadata[${index}].spotifyUrl must be a non-empty string`);
      }
    });

    // Handle single note case (special validation)
    if (params.episodeNotes.length === 1) {
      const singleNote = params.episodeNotes[0];
      if (!singleNote || typeof singleNote !== 'string' || singleNote.trim().length === 0) {
        throw new Error('Single episode note cannot be empty or null');
      }
      console.log('DEBUG: Processing single episode note', {
        noteLength: singleNote.length,
        wordCount: countWords(singleNote)
      });
    }

    // Handle multiple notes case (validate each note)
    if (params.episodeNotes.length > 1) {
      const validNotes = params.episodeNotes.filter((note, index) => {
        if (!note || typeof note !== 'string' || note.trim().length === 0) {
          console.warn(`DEBUG: Skipping empty episode note at index ${index}`);
          return false;
        }
        return true;
      });

      if (validNotes.length === 0) {
        throw new Error('All episode notes are empty or invalid - at least one valid note is required');
      }

      if (validNotes.length < params.episodeNotes.length) {
        console.warn(`DEBUG: Filtered out ${params.episodeNotes.length - validNotes.length} invalid episode notes`);
        // Update params to use only valid notes
        params.episodeNotes = validNotes;
      }

      console.log('DEBUG: Processing multiple episode notes', {
        originalCount: params.episodeNotes.length,
        validCount: validNotes.length,
        totalWordCount: validNotes.reduce((sum, note) => sum + countWords(note), 0)
      });
    }

    if (!params.userEmail || typeof params.userEmail !== 'string' || params.userEmail.trim() === '') {
      throw new Error('userEmail must be a non-empty string');
    }

    if (!params.editionDate || typeof params.editionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(params.editionDate)) {
      throw new Error('editionDate must be a valid YYYY-MM-DD string');
    }

    // Load the prompt template
    const template = await loadPromptTemplate(params.promptTemplatePath);
    
    console.log('DEBUG: Loaded prompt template', {
      templateLength: template.length,
      episodeCount: params.episodeNotes.length
    });

    // Build the full prompt by combining template with episode notes
    const prompt = buildFullPrompt(template, params);
    
    console.log('DEBUG: Built full prompt', {
      promptLength: prompt.length,
      episodeCount: params.episodeNotes.length,
      elapsedMs: Date.now() - startTime
    });

    return {
      prompt,
      template,
      episodeCount: params.episodeNotes.length,
      success: true
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    let errorMessage: string;
    let errorType: string;
    
    // Enhanced error handling with detailed error categorization
    if (error instanceof Error) {
      errorMessage = error.message;
      errorType = error.constructor.name;
      
      // Log detailed error information for debugging
      console.error('DEBUG: Newsletter prompt building error', {
        errorType,
        error: error.message,
        stack: error.stack,
        elapsedMs,
        params: {
          episodeCount: params.episodeNotes?.length || 0,
          userEmail: params.userEmail ? '***' + params.userEmail.slice(-4) : 'undefined',
          editionDate: params.editionDate || 'undefined',
          promptTemplatePath: params.promptTemplatePath || 'default'
        }
      });
    } else {
      errorMessage = 'Unknown error occurred during prompt building';
      errorType = 'UnknownError';
      
      console.error('DEBUG: Unknown error in newsletter prompt building', {
        errorType,
        error,
        elapsedMs,
        params: {
          episodeCount: params.episodeNotes?.length || 0,
          userEmail: params.userEmail ? '***' + params.userEmail.slice(-4) : 'undefined',
          editionDate: params.editionDate || 'undefined'
        }
      });
    }

    // Return structured error result
    return {
      prompt: '',
      template: '',
      episodeCount: 0,
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Load the newsletter prompt template from file
 * 
 * This function loads and validates the newsletter prompt template from a markdown file.
 * It performs comprehensive validation to ensure the template is suitable for newsletter generation.
 * 
 * @param templatePath - Optional custom path to the prompt template file
 * @returns Promise<string> - The loaded and validated prompt template content
 * @throws {Error} For various template loading/validation failures:
 *   - Template file not found or unreadable
 *   - Template file is empty or too short
 *   - Template missing required placeholders ([USER_EMAIL], [EDITION_DATE], [EPISODE_COUNT])
 *   - File system errors (permissions, disk space, etc.)
 * 
 * @note Environment Variable Support:
 *   - EDITION_PROMPT_PATH: Override the default prompt template path
 *   - Priority: explicit parameter > EDITION_PROMPT_PATH > default ('prompts/newsletter-edition.md')
 * 
 * @example
 * ```typescript
 * try {
 *   const template = await loadPromptTemplate('prompts/newsletter-edition.md');
 *   console.log('Template loaded:', template.length, 'characters');
 * } catch (error) {
 *   console.error('Failed to load template:', error.message);
 * }
 * ```
 */
async function loadPromptTemplate(templatePath?: string): Promise<string> {
  // Support environment variable override for edition prompt path
  const envPromptPath = process.env.EDITION_PROMPT_PATH;
  const defaultPath = 'prompts/newsletter-edition.md';
  
  // Priority: explicit parameter > environment variable > default
  const path = templatePath || envPromptPath || defaultPath;
  
  console.log('DEBUG: Loading newsletter prompt template', {
    explicitPath: templatePath || 'not provided',
    envPath: envPromptPath || 'not set',
    defaultPath,
    finalPath: path,
    source: templatePath ? 'explicit' : envPromptPath ? 'environment' : 'default'
  });
  
  try {
    // Resolve path relative to project root (where the server runs)
    const fullPath = resolve(path);
    const template = readFileSync(fullPath, 'utf-8').trim();
    
    if (!template) {
      throw new Error(`Prompt template file is empty: ${fullPath}`);
    }
    
    // Basic validation: should look like a prompt (contain some instructional text)
    if (template.length < 100) {
      throw new Error(`Prompt template seems too short (${template.length} chars). Expected detailed instructions.`);
    }
    
    // Verify it contains expected placeholders
    if (!template.includes('[USER_EMAIL]') || !template.includes('[EDITION_DATE]') || !template.includes('[EPISODE_COUNT]')) {
      throw new Error(`Prompt template missing required placeholders: [USER_EMAIL], [EDITION_DATE], [EPISODE_COUNT]`);
    }
    
    return template;
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load prompt template from "${path}": ${error.message}`);
    }
    throw new Error(`Failed to load prompt template from "${path}": Unknown error`);
  }
}

/**
 * Build the full prompt by combining the template with episode notes
 * 
 * This function takes the loaded prompt template and combines it with episode notes
 * to create a complete, formatted prompt ready for LLM processing. It handles
 * different formatting for single vs multiple episode notes and replaces all
 * template placeholders with actual values.
 * 
 * @param template - The loaded prompt template from the markdown file
 * @param params - Parameters containing episode notes and context information
 * @returns The complete, formatted prompt ready to send to the LLM
 * 
 * @example
 * ```typescript
 * const template = await loadPromptTemplate();
 * const prompt = buildFullPrompt(template, {
 *   episodeNotes: ['Episode 1 notes...', 'Episode 2 notes...'],
 *   userEmail: 'user@example.com',
 *   editionDate: '2025-01-27'
 * });
 * console.log('Generated prompt:', prompt);
 * ```
 */
function buildFullPrompt(template: string, params: BuildNewsletterPromptParams): string {
  // Replace placeholders in the template
  let prompt = template
    .replace(/\[USER_EMAIL\]/g, params.userEmail)
    .replace(/\[EDITION_DATE\]/g, params.editionDate)
    .replace(/\[EPISODE_COUNT\]/g, params.episodeNotes.length.toString());

  // Handle different edge cases for episode notes content
  let episodeNotesContent: string;

  if (params.episodeNotes.length === 1) {
    // Single episode note - simpler format
    const singleNote = params.episodeNotes[0].trim();
    let noteContent = `**Episode Notes:**\n\n`;
    
    // Add metadata (always available as it's required)
    const metadata = params.episodeMetadata[0];
    noteContent += `**Show:** ${metadata.showTitle}\n`;
    noteContent += `**Spotify URL:** ${metadata.spotifyUrl}\n\n`;
    
    noteContent += singleNote;
    episodeNotesContent = noteContent;
    
    console.log('DEBUG: Built prompt for single episode note', {
      noteLength: singleNote.length,
      wordCount: countWords(singleNote),
      hasMetadata: true
    });
  } else {
    // Multiple episode notes - numbered format with separators
    episodeNotesContent = params.episodeNotes
      .map((notes, index) => {
        let noteContent = `**Episode ${index + 1} Notes:**\n\n`;
        
        // Add metadata (always available as it's required)
        const metadata = params.episodeMetadata[index];
        noteContent += `**Show:** ${metadata.showTitle}\n`;
        noteContent += `**Spotify URL:** ${metadata.spotifyUrl}\n\n`;
        
        noteContent += notes.trim();
        return noteContent;
      })
      .join('\n\n---\n\n');
    
    console.log('DEBUG: Built prompt for multiple episode notes', {
      episodeCount: params.episodeNotes.length,
      totalWordCount: params.episodeNotes.reduce((sum, note) => sum + countWords(note), 0),
      hasMetadata: true
    });
  }

  // Replace the episode notes placeholder
  prompt = prompt.replace(/\[EPISODE_NOTES_CONTENT\]/g, episodeNotesContent);

  return prompt.trim();
}

/**
 * Validate episode notes for newsletter generation
 * 
 * This function performs comprehensive validation of episode notes to ensure
 * they are suitable for newsletter generation. It checks for data quality,
 * content length, and provides detailed warnings about potential issues.
 * 
 * @param episodeNotes - Array of episode notes text to validate
 * @returns Object containing validation results, warnings, and statistics
 * 
 * @example
 * ```typescript
 * const validation = validateEpisodeNotesForNewsletter([
 *   'Episode 1 notes with good content...',
 *   'Episode 2 notes...',
 *   '' // empty note
 * ]);
 * 
 * if (validation.isValid) {
 *   console.log('Notes are valid for newsletter generation');
 *   console.log('Total words:', validation.totalWordCount);
 *   console.log('Average words per note:', validation.averageWordCount);
 * } else {
 *   console.log('Validation warnings:', validation.warnings);
 * }
 * ```
 */
export function validateEpisodeNotesForNewsletter(episodeNotes: string[]): {
  isValid: boolean;
  warnings: string[];
  totalWordCount: number;
  averageWordCount: number;
  validNoteCount: number;
  originalNoteCount: number;
} {
  const warnings: string[] = [];
  
  if (!episodeNotes || !Array.isArray(episodeNotes)) {
    return {
      isValid: false,
      warnings: ['Episode notes must be an array'],
      totalWordCount: 0,
      averageWordCount: 0,
      validNoteCount: 0,
      originalNoteCount: 0
    };
  }

  const originalNoteCount = episodeNotes.length;

  if (episodeNotes.length === 0) {
    return {
      isValid: false,
      warnings: ['Episode notes array cannot be empty'],
      totalWordCount: 0,
      averageWordCount: 0,
      validNoteCount: 0,
      originalNoteCount
    };
  }

  let totalWordCount = 0;
  const validNotes: string[] = [];

  // Handle single note case
  if (episodeNotes.length === 1) {
    const singleNote = episodeNotes[0];
    if (!singleNote || typeof singleNote !== 'string') {
      warnings.push('Single episode note is not a valid string');
    } else {
      const trimmed = singleNote.trim();
      if (trimmed.length === 0) {
        warnings.push('Single episode note is empty');
      } else {
        const wordCount = countWords(trimmed);
        totalWordCount = wordCount;
        validNotes.push(trimmed);

        // Quality checks for single note
        if (wordCount < 100) {
          warnings.push(`Single episode note is very short (${wordCount} words) - newsletter may be limited`);
        }
        if (wordCount > 3000) {
          warnings.push(`Single episode note is very long (${wordCount} words) - may be too detailed for synthesis`);
        }
      }
    }
  } else {
    // Handle multiple notes case
    episodeNotes.forEach((notes, index) => {
      if (!notes || typeof notes !== 'string') {
        warnings.push(`Episode note ${index + 1} is not a valid string`);
        return;
      }

      const trimmed = notes.trim();
      if (trimmed.length === 0) {
        warnings.push(`Episode note ${index + 1} is empty`);
        return;
      }

      const wordCount = countWords(trimmed);
      totalWordCount += wordCount;
      validNotes.push(trimmed);

      // Check for quality issues
      if (wordCount < 50) {
        warnings.push(`Episode note ${index + 1} is very short (${wordCount} words) - may provide limited content`);
      }
      
      if (wordCount > 2000) {
        warnings.push(`Episode note ${index + 1} is very long (${wordCount} words) - may be too detailed for synthesis`);
      }
    });
  }

  const averageWordCount = validNotes.length > 0 ? totalWordCount / validNotes.length : 0;
  
  // Overall quality checks
  if (validNotes.length < episodeNotes.length) {
    warnings.push(`Only ${validNotes.length} of ${episodeNotes.length} episode notes are valid`);
  }

  // Different thresholds for single vs multiple notes
  if (episodeNotes.length === 1) {
    if (totalWordCount < 100) {
      warnings.push(`Single episode note is very short (${totalWordCount} words) - newsletter may be limited`);
    }
    if (totalWordCount > 5000) {
      warnings.push(`Single episode note is very long (${totalWordCount} words) - may hit token limits`);
    }
  } else {
    if (totalWordCount < 200) {
      warnings.push(`Total content is very short (${totalWordCount} words) - newsletter may be limited`);
    }
    if (totalWordCount > 10000) {
      warnings.push(`Total content is very long (${totalWordCount} words) - may hit token limits`);
    }
  }

  return {
    isValid: validNotes.length > 0,
    warnings,
    totalWordCount,
    averageWordCount,
    validNoteCount: validNotes.length,
    originalNoteCount
  };
}

/**
 * Sanitize HTML content for safe email newsletter use
 * 
 * This function removes potentially dangerous HTML elements and attributes
 * while preserving the formatting needed for email newsletters. It uses
 * the sanitize-html library with a carefully configured allowlist to ensure
 * email compatibility and security.
 * 
 * @param htmlContent - The HTML content to sanitize (from LLM generation)
 * @returns Sanitized HTML content safe for email use
 * 
 * @example
 * ```typescript
 * const rawHtml = '<h1>Newsletter</h1><script>alert("xss")</script><p>Content</p>';
 * const sanitized = sanitizeNewsletterContent(rawHtml);
 * // Result: '<h1>Newsletter</h1><p>Content</p>' (script removed)
 * 
 * // Safe HTML is preserved
 * const safeHtml = '<h2>Title</h2><p><strong>Bold text</strong> and <em>italic</em></p>';
 * const result = sanitizeNewsletterContent(safeHtml);
 * // Result: same as input (all elements allowed)
 * ```
 * 
 * @security This function prevents XSS attacks by:
 * - Removing script tags and event handlers
 * - Allowing only safe HTML elements and attributes
 * - Validating CSS properties and URL schemes
 * - Adding security attributes to external links
 */
export function sanitizeNewsletterContent(htmlContent: string): string {
  const sanitized = sanitizeHtml(htmlContent, {
    // Allow safe HTML elements for newsletter formatting
    allowedTags: [
      // HTML document structure (for complete HTML documents)
      'html', 'head', 'body', 'meta', 'style',
      // Table structure for email layout
      'table', 'tr', 'td',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Paragraphs and line breaks
      'p', 'br', 'hr',
      // Lists
      'ul', 'ol', 'li',
      // Text formatting
      'strong', 'b', 'em', 'i', 'u',
      // Quotes
      'blockquote', 'q',
      // Containers
      'div', 'span',
      // Links (with restrictions)
      'a',
      // Images (with restrictions)
      'img'
    ],
    // Allow safe attributes
    allowedAttributes: {
      // Global attributes
      '*': ['class', 'id', 'style'],
      // HTML document structure attributes
      'html': ['lang'],
      'head': [],
      'body': ['style'],
      'meta': ['charset', 'name', 'content'],
      'style': [],
      // Table attributes for email layout
      'table': ['role', 'cellpadding', 'cellspacing', 'border', 'align', 'width', 'style'],
      'tr': ['style'],
      'td': ['style'],
      // Link attributes
      'a': ['href', 'title', 'target'],
      // Image attributes
      'img': ['src', 'alt', 'title', 'width', 'height'],
      // Style attributes for email compatibility
      'h1': ['style'],
      'h2': ['style'],
      'h3': ['style'],
      'h4': ['style'],
      'h5': ['style'],
      'h6': ['style'],
      'p': ['style'],
      'ul': ['style'],
      'ol': ['style'],
      'li': ['style'],
      'div': ['style'],
      'span': ['style']
    },
    // Allow safe CSS properties in style attributes
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
        'font-size': [/^\d+(?:px|em|%)$/],
        'font-weight': [/^(normal|bold|bolder|lighter|\d{3})$/],
        'text-align': [/^(left|right|center|justify)$/],
        'text-decoration': [/^(none|underline|overline|line-through)$/],
        'line-height': [/^\d+(?:\.\d+)?$/],
        'margin': [/^\d+(?:px|em|%)?$/],
        'margin-top': [/^\d+(?:px|em|%)?$/],
        'margin-bottom': [/^\d+(?:px|em|%)?$/],
        'margin-left': [/^\d+(?:px|em|%)?$/],
        'margin-right': [/^\d+(?:px|em|%)?$/],
        'padding': [/^\d+(?:px|em|%)?$/],
        'padding-top': [/^\d+(?:px|em|%)?$/],
        'padding-bottom': [/^\d+(?:px|em|%)?$/],
        'padding-left': [/^\d+(?:px|em|%)?$/],
        'padding-right': [/^\d+(?:px|em|%)?$/],
        // Additional styles for table layout
        'width': [/^\d+(?:px|em|%)?$/],
        'font-family': [/^[a-zA-Z\s,]+$/],
        'background': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/]
      }
    },
    // Allow safe URL schemes
    allowedSchemes: ['http', 'https', 'mailto'],
    // Allow relative URLs
    allowProtocolRelative: false,
    // Transform functions for additional security
    transformTags: {
      'a': (tagName: string, attribs: any) => {
        // Ensure external links open in new tab
        if (attribs.href && attribs.href.startsWith('http')) {
          attribs.target = '_blank';
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs };
      }
    }
  });

  return sanitized.trim();
}

/**
 * Count words in a text string (simple whitespace-based counting)
 * 
 * This function provides a simple word count implementation for validation
 * and quality assessment of episode notes. It uses whitespace-based tokenization
 * which is suitable for English text content.
 * 
 * @param text - The text string to count words in
 * @returns Number of words (0 for empty or null text)
 * 
 * @example
 * ```typescript
 * countWords('Hello world'); // Returns: 2
 * countWords('  Multiple   spaces  '); // Returns: 2
 * countWords(''); // Returns: 0
 * countWords('Single'); // Returns: 1
 * ```
 * 
 * @note This is a simple implementation that may not handle all edge cases
 * like punctuation, numbers, or special characters perfectly, but it's
 * sufficient for content validation purposes.
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
} 