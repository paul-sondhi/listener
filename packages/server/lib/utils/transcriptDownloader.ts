/**
 * Transcript Download and Parsing Utilities
 * 
 * Functions to download transcript files from Supabase Storage,
 * decompress them, and extract the transcript text for processing.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'node:zlib';
import { Database } from '../../../shared/src/types/supabase.js';

/**
 * Result of downloading and parsing a transcript file
 */
export interface TranscriptDownloadResult {
  /** The extracted transcript text */
  transcript: string;
  /** Word count of the transcript */
  wordCount: number;
  /** Size of the downloaded file in bytes */
  fileSizeBytes: number;
  /** Time taken to download and parse in milliseconds */
  elapsedMs: number;
}

/**
 * Error thrown when transcript download or parsing fails
 */
export class TranscriptDownloadError extends Error {
  constructor(
    message: string,
    public readonly storagePath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TranscriptDownloadError';
  }
}

/**
 * Download and parse a transcript file from Supabase Storage
 * 
 * The transcript files are stored as gzipped JSONL files where each line
 * contains a JSON object with transcript segments. This function downloads
 * the file, decompresses it, parses the JSONL, and extracts the full transcript text.
 * 
 * @param supabase - Supabase client instance
 * @param storagePath - Path to the transcript file in the 'transcripts' bucket
 * @returns Promise<TranscriptDownloadResult> - The parsed transcript and metadata
 * @throws TranscriptDownloadError - If download or parsing fails
 */
export async function downloadAndParseTranscript(
  supabase: SupabaseClient<Database>,
  storagePath: string
): Promise<TranscriptDownloadResult> {
  const startTime = Date.now();
  
  console.log('DEBUG: Downloading transcript file', {
    storagePath,
    bucket: 'transcripts'
  });

  try {
    // Step 1: Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('transcripts')
      .download(storagePath);

    if (downloadError) {
      throw new TranscriptDownloadError(
        `Failed to download transcript file: ${downloadError.message}`,
        storagePath,
        downloadError
      );
    }

    if (!fileData) {
      throw new TranscriptDownloadError(
        'Downloaded file data is null or undefined',
        storagePath
      );
    }

    // Convert Blob to Buffer for processing
    const compressedBuffer = Buffer.from(await fileData.arrayBuffer());
    const fileSizeBytes = compressedBuffer.length;
    
    console.log('DEBUG: File downloaded successfully', {
      storagePath,
      fileSizeBytes,
      compressionType: 'gzip'
    });

    // Step 2: Decompress the file using gunzip
    let decompressedBuffer: Buffer;
    try {
      decompressedBuffer = gunzipSync(compressedBuffer);
    } catch (gunzipError) {
      throw new TranscriptDownloadError(
        `Failed to decompress transcript file: ${gunzipError instanceof Error ? gunzipError.message : 'Unknown gunzip error'}`,
        storagePath,
        gunzipError instanceof Error ? gunzipError : undefined
      );
    }

    const decompressedText = decompressedBuffer.toString('utf-8');
    
    console.log('DEBUG: File decompressed successfully', {
      storagePath,
      originalSizeBytes: fileSizeBytes,
      decompressedSizeBytes: decompressedBuffer.length,
      compressionRatio: (fileSizeBytes / decompressedBuffer.length).toFixed(2)
    });

    // Step 3: Parse JSONL and extract transcript text
    const transcript = parseJsonlTranscript(decompressedText, storagePath);
    
    // Step 4: Calculate word count (simple whitespace-based count)
    const wordCount = countWords(transcript);
    
    const elapsedMs = Date.now() - startTime;
    
    console.log('DEBUG: Transcript parsed successfully', {
      storagePath,
      transcriptLength: transcript.length,
      wordCount,
      elapsedMs
    });

    return {
      transcript,
      wordCount,
      fileSizeBytes,
      elapsedMs
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    
    console.error('DEBUG: Transcript download failed', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsedMs
    });

    // Re-throw TranscriptDownloadError as-is, wrap other errors
    if (error instanceof TranscriptDownloadError) {
      throw error;
    }
    
    throw new TranscriptDownloadError(
      `Unexpected error downloading transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
      storagePath,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse JSONL transcript data and extract the full transcript text
 * 
 * The JSONL format contains one JSON object per line, each representing
 * a segment of the transcript with text and timing information.
 * 
 * @param jsonlText - The decompressed JSONL content
 * @param storagePath - Path for error reporting
 * @returns The concatenated transcript text
 * @throws TranscriptDownloadError - If JSONL parsing fails
 */
function parseJsonlTranscript(jsonlText: string, storagePath: string): string {
  if (!jsonlText || jsonlText.trim().length === 0) {
    throw new TranscriptDownloadError(
      'Transcript file is empty after decompression',
      storagePath
    );
  }

  const lines = jsonlText.trim().split('\n');
  const transcriptSegments: string[] = [];
  
  console.log('DEBUG: Parsing JSONL transcript', {
    storagePath,
    totalLines: lines.length
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue; // Skip empty lines
    }

    try {
      const segment = JSON.parse(line);
      
      // Extract text from the segment - handle different possible formats
      let text: string | undefined;
      if (typeof segment === 'string') {
        text = segment;
      } else if (segment && typeof segment === 'object') {
        // Try common field names for transcript text
        text = segment.text || segment.transcript || segment.content || segment.words;
      }
      
      if (typeof text === 'string' && text.trim().length > 0) {
        transcriptSegments.push(text.trim());
      }
      
    } catch (parseError) {
      console.warn('DEBUG: Failed to parse JSONL line', {
        storagePath,
        lineNumber: i + 1,
        line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      });
      
      // Don't throw on individual line failures - transcript might still be usable
      continue;
    }
  }

  if (transcriptSegments.length === 0) {
    throw new TranscriptDownloadError(
      'No valid transcript segments found in JSONL file',
      storagePath
    );
  }

  // Join all segments with spaces to form the complete transcript
  const fullTranscript = transcriptSegments.join(' ');
  
  console.log('DEBUG: JSONL parsing completed', {
    storagePath,
    totalSegments: transcriptSegments.length,
    transcriptLength: fullTranscript.length
  });

  return fullTranscript;
}

/**
 * Count words in a text string using simple whitespace splitting
 * 
 * @param text - The text to count words in
 * @returns Number of words
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  
  // Split on whitespace and filter out empty strings
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Validate that a storage path looks reasonable
 * 
 * @param storagePath - The storage path to validate
 * @returns true if path looks valid, false otherwise
 */
export function isValidStoragePath(storagePath: string): boolean {
  if (!storagePath || typeof storagePath !== 'string') {
    return false;
  }
  
  // Should not be empty or just whitespace
  if (storagePath.trim().length === 0) {
    return false;
  }
  
  // Should not contain dangerous characters
  if (storagePath.includes('..') || storagePath.includes('//')) {
    return false;
  }
  
  // Should have a reasonable file extension (optional check)
  const validExtensions = ['.jsonl.gz', '.json.gz', '.txt.gz'];
  const hasValidExtension = validExtensions.some(ext => storagePath.endsWith(ext));
  
  if (!hasValidExtension) {
    console.warn('DEBUG: Storage path has unexpected extension', {
      storagePath,
      expectedExtensions: validExtensions
    });
    // Don't fail validation - just warn
  }
  
  return true;
} 