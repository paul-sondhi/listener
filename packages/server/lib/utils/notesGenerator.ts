/**
 * Episode Notes Generation Utilities
 * 
 * High-level functions for generating episode notes from transcripts
 * using the Gemini API with custom prompt templates.
 */

import { generateEpisodeNotes, EpisodeNotesResult, GeminiAPIError } from '../llm/gemini.js';
import { NotesWorkerConfig } from '../../config/notesWorkerConfig.js';

/**
 * Required podcast metadata for notes generation
 */
export interface PodcastMetadata {
  /** The podcast show title (required) */
  showTitle: string;
  /** The podcast Spotify URL (required) */
  spotifyUrl: string;
}

/**
 * Result of generating notes for a single episode
 */
export interface NotesGenerationResult {
  /** The generated episode notes */
  notes: string;
  /** The Gemini model used for generation */
  model: string;
  /** Time taken to generate notes in milliseconds */
  elapsedMs: number;
  /** Whether the generation was successful */
  success: boolean;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Generate episode notes using the configured prompt template
 * 
 * This function combines the custom prompt template from the config
 * with the transcript text and podcast metadata, then calls the Gemini API
 * to generate structured episode notes.
 * 
 * @param transcript - The full episode transcript text
 * @param config - Notes worker configuration containing the prompt template
 * @param metadata - Required podcast metadata (showTitle and spotifyUrl)
 * @returns Promise<NotesGenerationResult> - Generation result with notes or error
 */
export async function generateNotesWithPrompt(
  transcript: string,
  config: NotesWorkerConfig,
  metadata: PodcastMetadata
): Promise<NotesGenerationResult> {
  const startTime = Date.now();
  
  console.log('DEBUG: Generating episode notes', {
    transcriptLength: transcript.length,
    promptTemplateLength: config.promptTemplate.length,
    model: 'gemini-1.5-flash',
    showTitle: metadata.showTitle,
    spotifyUrl: metadata.spotifyUrl
  });

  try {
    // Validate inputs
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty or null');
    }

    if (!config.promptTemplate || config.promptTemplate.trim().length === 0) {
      throw new Error('Prompt template is empty or null');
    }

    // Create the full prompt by combining template with transcript and metadata
    const fullPrompt = buildFullPrompt(config.promptTemplate, transcript, metadata);
    
    console.log('DEBUG: Built full prompt', {
      promptLength: fullPrompt.length,
      transcriptWordCount: countWords(transcript)
    });

    // Call the Gemini API with our custom prompt
    const result: EpisodeNotesResult = await generateEpisodeNotes(transcript, {
      systemPrompt: fullPrompt,
      temperature: 0.3, // Consistent, focused responses
      maxTokens: 2048   // Reasonable limit for episode notes
    });

    const elapsedMs = Date.now() - startTime;
    
    console.log('DEBUG: Successfully generated episode notes', {
      notesLength: result.notes.length,
      model: result.model,
      elapsedMs
    });

    return {
      notes: result.notes,
      model: result.model,
      elapsedMs,
      success: true
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    let errorMessage: string;
    
    if (error instanceof GeminiAPIError) {
      errorMessage = `Gemini API error (${error.statusCode}): ${error.message}`;
      console.error('DEBUG: Gemini API error', {
        statusCode: error.statusCode,
        message: error.message,
        responseBody: error.responseBody.substring(0, 500),
        elapsedMs
      });
    } else if (error instanceof Error) {
      errorMessage = error.message;
      console.error('DEBUG: Notes generation error', {
        error: error.message,
        stack: error.stack,
        elapsedMs
      });
    } else {
      errorMessage = 'Unknown error occurred';
      console.error('DEBUG: Unknown error in notes generation', {
        error,
        elapsedMs
      });
    }

    return {
      notes: '',
      model: '',
      elapsedMs,
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Build the full prompt by combining the template with the transcript and metadata
 * 
 * @param promptTemplate - The loaded prompt template from the markdown file
 * @param transcript - The episode transcript text
 * @param metadata - Required podcast metadata
 * @returns The complete prompt to send to Gemini
 */
function buildFullPrompt(promptTemplate: string, transcript: string, metadata: PodcastMetadata): string {
  // Replace metadata placeholders in the template
  const prompt = promptTemplate
    .replace(/\[SHOW_TITLE\]/g, metadata.showTitle)
    .replace(/\[SPOTIFY_URL\]/g, metadata.spotifyUrl);
  
  // Append the transcript to the prompt
  return `${prompt.trim()}

---

**TRANSCRIPT TO ANALYZE:**

${transcript.trim()}`;
}

/**
 * Count words in a text string (simple whitespace-based counting)
 * 
 * @param text - The text to count words in
 * @returns Number of words
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Validate that a transcript is suitable for notes generation
 * 
 * @param transcript - The transcript text to validate
 * @returns Object with validation result and any warnings
 */
export function validateTranscriptForNotes(transcript: string): {
  isValid: boolean;
  warnings: string[];
  wordCount: number;
} {
  const warnings: string[] = [];
  
  if (!transcript || typeof transcript !== 'string') {
    return {
      isValid: false,
      warnings: ['Transcript is not a valid string'],
      wordCount: 0
    };
  }

  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      warnings: ['Transcript is empty'],
      wordCount: 0
    };
  }

  const wordCount = countWords(trimmed);
  
  // Check for various quality issues
  if (wordCount < 50) {
    warnings.push(`Transcript is very short (${wordCount} words) - notes may be limited`);
  }
  
  if (wordCount > 50000) {
    warnings.push(`Transcript is very long (${wordCount} words) - may hit token limits`);
  }
  
  // Check for obvious transcription issues
  if (trimmed.includes('[MUSIC]') || trimmed.includes('[INAUDIBLE]')) {
    warnings.push('Transcript contains transcription artifacts that may affect quality');
  }
  
  // Check for reasonable content
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 5) {
    warnings.push('Transcript has very few sentences - may not be suitable for analysis');
  }

  return {
    isValid: wordCount >= 10, // Minimum viable transcript
    warnings,
    wordCount
  };
} 