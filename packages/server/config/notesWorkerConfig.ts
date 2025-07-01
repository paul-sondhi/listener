/**
 * Configuration for the Episode Notes Worker
 * Reads and validates environment variables with sensible defaults
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface NotesWorkerConfig {
  /** Whether the notes worker is enabled */
  enabled: boolean;
  /** Hours to look back for new transcripts needing notes */
  lookbackHours: number;
  /** When true, re-process the 10 most-recent transcripts (overwrite duplicates); when false, run in normal mode */
  last10Mode: boolean;
  /** Maximum concurrent Gemini API calls */
  maxConcurrency: number;
  /** Path to the prompt template file */
  promptPath: string;
  /** Cached content of the prompt template */
  promptTemplate: string;
  /** Gemini API key (required) */
  geminiApiKey: string;
}

/**
 * Parse and validate notes worker configuration from environment variables
 * @returns Validated configuration object with loaded prompt template
 * @throws Error if validation fails or prompt file cannot be read
 */
export function getNotesWorkerConfig(): NotesWorkerConfig {
  // Parse enabled flag (default: true, disabled only if explicitly set to 'false')
  const enabled = process.env.NOTES_WORKER_ENABLED !== 'false';

  // Parse lookback hours with validation
  const lookbackHours = parseInt(process.env.NOTES_LOOKBACK_HOURS || '24', 10);
  if (isNaN(lookbackHours) || lookbackHours < 1 || lookbackHours > 168) { // 1 hour to 1 week
    throw new Error(`Invalid NOTES_LOOKBACK_HOURS: "${process.env.NOTES_LOOKBACK_HOURS}". Must be a number between 1 and 168 (hours).`);
  }

  // Parse last10Mode flag (strict boolean semantics) – any value other than the string "true" yields false
  const last10Mode: boolean = process.env.NOTES_WORKER_L10 === 'true';

  // Parse max concurrency with validation
  const maxConcurrency = parseInt(process.env.NOTES_MAX_CONCURRENCY || '30', 10);
  if (isNaN(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 100) {
    throw new Error(`Invalid NOTES_MAX_CONCURRENCY: "${process.env.NOTES_MAX_CONCURRENCY}". Must be a number between 1 and 100.`);
  }

  // Parse prompt path with validation
  const promptPath = process.env.NOTES_PROMPT_PATH || 'prompts/episode-notes.md';
  
  // Load and validate prompt template file
  let promptTemplate: string;
  try {
    // Resolve path relative to project root (where the server runs)
    const fullPromptPath = resolve(promptPath);
    promptTemplate = readFileSync(fullPromptPath, 'utf-8').trim();
    
    if (!promptTemplate) {
      throw new Error(`Prompt template file is empty: ${fullPromptPath}`);
    }
    
    // Basic validation: should look like a prompt (contain some instructional text)
    if (promptTemplate.length < 50) {
      throw new Error(`Prompt template seems too short (${promptTemplate.length} chars). Expected detailed instructions.`);
    }
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load prompt template from "${promptPath}": ${error.message}`);
    }
    throw new Error(`Failed to load prompt template from "${promptPath}": Unknown error`);
  }

  // Validate Gemini API key
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey || geminiApiKey.trim().length === 0) {
    throw new Error('GEMINI_API_KEY environment variable is required but not set.');
  }

  // Validate API key format (basic check)
  if (!geminiApiKey.startsWith('AIza')) {
    console.warn('Warning: GEMINI_API_KEY does not start with "AIza" - this may not be a valid Google API key.');
  }

  return {
    enabled,
    lookbackHours,
    last10Mode,
    maxConcurrency,
    promptPath,
    promptTemplate,
    geminiApiKey: geminiApiKey.trim(),
  };
}

/**
 * Get a human-readable summary of the current configuration
 * Useful for logging and debugging (excludes sensitive data like API keys)
 */
export function getConfigSummary(config: NotesWorkerConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    lookback_hours: config.lookbackHours,
    last10_mode: config.last10Mode,
    max_concurrency: config.maxConcurrency,
    prompt_path: config.promptPath,
    prompt_template_length: config.promptTemplate.length,
    gemini_api_key_configured: config.geminiApiKey.length > 0,
    gemini_api_key_prefix: config.geminiApiKey.substring(0, 6) + '...',
  };
}

/**
 * Validate that all required dependencies are available
 * @param config - The configuration to validate
 * @throws Error if any dependencies are missing or invalid
 */
export function validateDependencies(config: NotesWorkerConfig): void {
  // Check that prompt template contains expected sections
  const requiredSections = [
    'main topics',
    'key insights',
    'takeaways'
  ];
  
  const lowerPrompt = config.promptTemplate.toLowerCase();
  const missingSections = requiredSections.filter(section => 
    !lowerPrompt.includes(section)
  );
  
  if (missingSections.length > 0) {
    console.warn(`Warning: Prompt template may be missing expected sections: ${missingSections.join(', ')}`);
  }
  
  // Verify prompt template has reasonable structure
  if (!lowerPrompt.includes('transcript') && !lowerPrompt.includes('episode')) {
    console.warn('Warning: Prompt template does not mention "transcript" or "episode" - this may not be suitable for episode notes generation.');
  }
} 