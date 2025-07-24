import { describe, it, expect } from 'vitest';
import { TranscriptSource } from '@listener/shared';

describe('TranscriptSource type with deepgram', () => {
  it('should accept deepgram as a valid source value', () => {
    const validSources: TranscriptSource[] = ['taddy', 'podcaster', 'deepgram'];
    
    validSources.forEach(source => {
      expect(source).toBeDefined();
      expect(typeof source).toBe('string');
    });
  });

  it('should work with deepgram in transcript operations', () => {
    // Test that deepgram can be used as a source value
    const deepgramSource: TranscriptSource = 'deepgram';
    expect(deepgramSource).toBe('deepgram');
    
    // Test in a function that accepts TranscriptSource
    const processTranscriptSource = (source: TranscriptSource) => {
      return `Processing transcript from ${source}`;
    };
    
    expect(processTranscriptSource('deepgram')).toBe('Processing transcript from deepgram');
    expect(processTranscriptSource('taddy')).toBe('Processing transcript from taddy');
    expect(processTranscriptSource('podcaster')).toBe('Processing transcript from podcaster');
  });

  it('should work in transcript metadata objects', () => {
    interface TranscriptMetadata {
      source: TranscriptSource | null;
      status: string;
    }
    
    const deepgramTranscript: TranscriptMetadata = {
      source: 'deepgram',
      status: 'full'
    };
    
    const taddyTranscript: TranscriptMetadata = {
      source: 'taddy', 
      status: 'full'
    };
    
    const unknownTranscript: TranscriptMetadata = {
      source: null,
      status: 'error'
    };
    
    expect(deepgramTranscript.source).toBe('deepgram');
    expect(taddyTranscript.source).toBe('taddy');
    expect(unknownTranscript.source).toBeNull();
  });

  it('should validate source values correctly', () => {
    const isValidSource = (value: any): value is TranscriptSource => {
      return ['taddy', 'podcaster', 'deepgram'].includes(value);
    };
    
    expect(isValidSource('deepgram')).toBe(true);
    expect(isValidSource('taddy')).toBe(true);
    expect(isValidSource('podcaster')).toBe(true);
    expect(isValidSource('invalid')).toBe(false);
    expect(isValidSource('')).toBe(false);
    expect(isValidSource(null)).toBe(false);
    expect(isValidSource(undefined)).toBe(false);
  });
});