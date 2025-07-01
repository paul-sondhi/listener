import { describe, it, expect } from 'vitest';
import { upsertEpisodeNotes } from '../notesDatabase.js';

// Build minimal Supabase mock with upsert chain support
function buildSupabaseMock() {
  let storedData: any = null;

  return {
    _rows: [] as any[],
    from: (_table: string) => ({
      upsert: (data: any) => {
        storedData = data; // capture
        return {
          select: (_cols: string) => ({
            single: () => Promise.resolve({ data: { id: 'note-1' }, error: null })
          })
        };
      }
    }),
    getStored: () => storedData
  } as any;
}

describe('upsertEpisodeNotes()', () => {
  it('writes done status with notes and model', async () => {
    const supabase = buildSupabaseMock();
    const result = await upsertEpisodeNotes(supabase, {
      episodeId: 'ep-1',
      transcriptId: 't-1',
      status: 'done',
      notes: 'Some generated notes',
      model: 'gemini-1.5-flash'
    });

    expect(result.success).toBe(true);
    const row = (supabase as any).getStored();
    expect(row.status).toBe('done');
    expect(row.notes).toBe('Some generated notes');
    expect(row.model).toBe('gemini-1.5-flash');
    expect(row.error_message).toBeNull();
  });

  it('writes error status with classified trimmed error_message', async () => {
    const supabase = buildSupabaseMock();
    const longErr = 'Object not found 404 '.repeat(30); // long msg >250

    const result = await upsertEpisodeNotes(supabase, {
      episodeId: 'ep-2',
      transcriptId: 't-2',
      status: 'error',
      errorMessage: longErr
    });

    expect(result.success).toBe(true);
    const row = (supabase as any).getStored();
    expect(row.status).toBe('error');
    expect(row.notes).toBeNull();
    expect(row.model).toBeNull();
    expect(row.error_message.startsWith('download_error:')).toBe(true);
    expect(row.error_message.length).toBeLessThanOrEqual(260);
  });
}); 