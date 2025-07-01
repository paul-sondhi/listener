import { describe, it, expect } from 'vitest';
import { downloadAndParseTranscript, TranscriptDownloadError } from '../utils/transcriptDownloader.js';
import { gzipSync } from 'node:zlib';

// Helper to build a fake Supabase client with custom download behaviour
function buildSupabaseMock(downloadImpl: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>) {
  return {
    storage: {
      from: () => ({
        download: downloadImpl
      })
    }
  } as any;
}

describe('downloadAndParseTranscript()', () => {
  it('successfully downloads, decompresses, and parses JSONL transcript', async () => {
    // Create sample JSONL (2 lines)
    const jsonl = JSON.stringify({ text: 'Hello world' }) + '\n' + JSON.stringify({ text: 'Second line' }) + '\n';
    const gzipped = gzipSync(Buffer.from(jsonl, 'utf-8'));
    const blob = new Blob([gzipped]);

    const supabaseMock = buildSupabaseMock(async () => ({ data: blob, error: null }));

    const result = await downloadAndParseTranscript(supabaseMock, 'shows/ep1.jsonl.gz');

    expect(result.transcript).toBe('Hello world Second line');
    expect(result.wordCount).toBe(4);
    expect(result.fileSizeBytes).toBe(gzipped.length);
  });

  it('throws TranscriptDownloadError on 404', async () => {
    const supabaseMock = buildSupabaseMock(async () => ({ data: null, error: { message: 'Object not found' } }));

    await expect(downloadAndParseTranscript(supabaseMock, 'missing/file.gz')).rejects.toBeInstanceOf(TranscriptDownloadError);
  });
}); 