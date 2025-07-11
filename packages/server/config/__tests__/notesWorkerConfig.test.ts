import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNotesWorkerConfig, NotesWorkerConfig } from '../notesWorkerConfig.js';

// Preserve original env so tests don't bleed state
const ORIGINAL_ENV = { ...process.env } as Record<string, string | undefined>;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function deleteNotesEnvVars() {
  delete process.env.NOTES_LOOKBACK_HOURS;
  delete process.env.NOTES_WORKER_L10;
  delete process.env.NOTES_WORKER_L10_COUNT;
  delete process.env.NOTES_MAX_CONCURRENCY;
  delete process.env.NOTES_PROMPT_PATH;
  delete process.env.GEMINI_API_KEY;
}

// ------------------------------------------------------------------
// Test Suite
// ------------------------------------------------------------------

describe('getNotesWorkerConfig()', () => {
  beforeEach(() => {
    resetEnv();
    deleteNotesEnvVars();
    // Provide required GEMINI_API_KEY default so tests pass
    process.env.GEMINI_API_KEY = 'AIza-test-key';
  });

  afterEach(() => {
    resetEnv();
  });

  it('returns expected defaults when no overrides are provided', () => {
    const cfg: NotesWorkerConfig = getNotesWorkerConfig();

    expect(cfg.enabled).toBe(true);
    expect(cfg.lookbackHours).toBe(24);
    expect(cfg.last10Mode).toBe(false);
    expect(cfg.last10Count).toBe(10);
    expect(cfg.maxConcurrency).toBe(30);
    expect(cfg.promptPath).toBe('prompts/episode-notes.md');
    expect(cfg.promptTemplate.length).toBeGreaterThan(50);
  });

  it('applies environment variable overrides correctly', () => {
    process.env.NOTES_LOOKBACK_HOURS = '12';
    process.env.NOTES_WORKER_L10 = 'true';
    process.env.NOTES_WORKER_L10_COUNT = '25';
    process.env.NOTES_MAX_CONCURRENCY = '5';
    process.env.NOTES_PROMPT_PATH = 'prompts/episode-notes.md'; // same path but override for coverage

    const cfg = getNotesWorkerConfig();

    expect(cfg.lookbackHours).toBe(12);
    expect(cfg.last10Mode).toBe(true);
    expect(cfg.last10Count).toBe(25);
    expect(cfg.maxConcurrency).toBe(5);
    expect(cfg.promptPath).toBe('prompts/episode-notes.md');
  });

  it('throws when invalid lookback is provided', () => {
    process.env.NOTES_LOOKBACK_HOURS = '0';
    expect(() => getNotesWorkerConfig()).toThrow();
  });

  it('throws when GEMINI_API_KEY is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => getNotesWorkerConfig()).toThrow(/GEMINI_API_KEY/);
  });

  it('validates NOTES_WORKER_L10_COUNT correctly', () => {
    // Test valid values
    process.env.NOTES_WORKER_L10_COUNT = '1';
    expect(() => getNotesWorkerConfig()).not.toThrow();

    process.env.NOTES_WORKER_L10_COUNT = '100';
    expect(() => getNotesWorkerConfig()).not.toThrow();

    process.env.NOTES_WORKER_L10_COUNT = '1000';
    expect(() => getNotesWorkerConfig()).not.toThrow();

    // Test invalid values
    process.env.NOTES_WORKER_L10_COUNT = '0';
    expect(() => getNotesWorkerConfig()).toThrow(/NOTES_WORKER_L10_COUNT.*Must be a number between 1 and 1000/);

    process.env.NOTES_WORKER_L10_COUNT = '1001';
    expect(() => getNotesWorkerConfig()).toThrow(/NOTES_WORKER_L10_COUNT.*Must be a number between 1 and 1000/);

    process.env.NOTES_WORKER_L10_COUNT = 'invalid';
    expect(() => getNotesWorkerConfig()).toThrow(/NOTES_WORKER_L10_COUNT.*Must be a number between 1 and 1000/);
  });

  it('defaults L10 count to 10 when L10 mode is enabled but count is not specified', () => {
    process.env.NOTES_WORKER_L10 = 'true';
    // Don't set NOTES_WORKER_L10_COUNT - should default to 10

    const cfg = getNotesWorkerConfig();

    expect(cfg.last10Mode).toBe(true);
    expect(cfg.last10Count).toBe(10);
  });
}); 