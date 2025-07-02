import { describe, it, expect, beforeEach as _beforeEach, afterEach, vi as _vi } from 'vitest';
import { 
  buildNewsletterEditionPrompt, 
  validateEpisodeNotesForNewsletter, 
  sanitizeNewsletterContent 
} from '../buildNewsletterEditionPrompt';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

// --- Mock Data ---
const mockNotes = [
  'Episode 1: Discussed AI trends, key takeaways on LLMs, and notable quotes from Sam Altman.',
  'Episode 2: Deep dive into podcast analytics, audience growth, and monetization strategies.',
  'Episode 3: Interview with Jane Doe about podcast storytelling and creative workflows.'
];

const userEmail = 'testuser@example.com';
const editionDate = '2025-01-27';
const defaultTemplatePath = resolve('prompts/newsletter-edition.md');
const customTemplatePath = resolve('prompts/newsletter-edition.custom.md');

// --- Helper: Write a custom template for testing ---
function writeCustomTemplate(content: string) {
  writeFileSync(customTemplatePath, content, 'utf-8');
}
function removeCustomTemplate() {
  try { unlinkSync(customTemplatePath); } catch { /* File may not exist, ignore error */ }
}

// --- Tests ---
describe('buildNewsletterEditionPrompt', () => {
  afterEach(() => {
    // Clean up any custom template
    removeCustomTemplate();
    delete process.env.NEWSLETTER_PROMPT_PATH;
  });

  it('throws on empty episodeNotes array', async () => {
    const result = await buildNewsletterEditionPrompt([], userEmail, editionDate);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/);
  });

  it('throws on missing userEmail or editionDate (simple signature)', async () => {
    // @ts-expect-error - Testing missing userEmail
    await expect(buildNewsletterEditionPrompt(mockNotes, undefined, editionDate)).rejects.toThrow();
    // @ts-expect-error - Testing missing editionDate
    await expect(buildNewsletterEditionPrompt(mockNotes, userEmail, undefined)).rejects.toThrow();
  });

  it('builds prompt for a single episode note', async () => {
    const result = await buildNewsletterEditionPrompt([mockNotes[0]], userEmail, editionDate);
    expect(result.success).toBe(true);
    expect(result.prompt).toContain(mockNotes[0]);
    expect(result.prompt).toContain(userEmail);
    expect(result.prompt).toContain(editionDate);
    expect(result.episodeCount).toBe(1);
  });

  it('builds prompt for multiple episode notes', async () => {
    const result = await buildNewsletterEditionPrompt(mockNotes, userEmail, editionDate);
    expect(result.success).toBe(true);
    expect(result.prompt).toContain(mockNotes[0]);
    expect(result.prompt).toContain(mockNotes[1]);
    expect(result.prompt).toContain(mockNotes[2]);
    expect(result.episodeCount).toBe(3);
  });

  it('filters out empty/invalid notes in multiple notes', async () => {
    const notes = [mockNotes[0], '', '   ', mockNotes[1]];
    const result = await buildNewsletterEditionPrompt(notes, userEmail, editionDate);
    expect(result.success).toBe(true);
    expect(result.episodeCount).toBe(2);
    expect(result.prompt).toContain(mockNotes[0]);
    expect(result.prompt).toContain(mockNotes[1]);
  });

  it('returns error if all notes are empty/invalid', async () => {
    const notes = ['', '   ', null as any];
    const result = await buildNewsletterEditionPrompt(notes, userEmail, editionDate);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid note/);
  });

  it('loads template from explicit path', async () => {
    const customContent = readFileSync(defaultTemplatePath, 'utf-8').replace('Newsletter', 'Custom Newsletter');
    writeCustomTemplate(customContent);
    const result = await buildNewsletterEditionPrompt({
      episodeNotes: mockNotes,
      userEmail,
      editionDate,
      promptTemplatePath: customTemplatePath
    });
    expect(result.success).toBe(true);
    expect(result.template).toContain('Custom Newsletter');
  });

  it('loads template from NEWSLETTER_PROMPT_PATH env var', async () => {
    const customContent = readFileSync(defaultTemplatePath, 'utf-8').replace('Newsletter', 'Env Newsletter');
    writeCustomTemplate(customContent);
    process.env.NEWSLETTER_PROMPT_PATH = customTemplatePath;
    const result = await buildNewsletterEditionPrompt(mockNotes, userEmail, editionDate);
    expect(result.success).toBe(true);
    expect(result.template).toContain('Env Newsletter');
  });

  it('returns error if template is missing required placeholders', async () => {
    writeCustomTemplate('Missing placeholders');
    const result = await buildNewsletterEditionPrompt({
      episodeNotes: mockNotes,
      userEmail,
      editionDate,
      promptTemplatePath: customTemplatePath
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too short/);
  });

  it('returns error if template is missing required placeholders (long template)', async () => {
    // This template is long enough but does NOT contain any required placeholders
    const longTemplate = 'This is a long template that should pass the length check but is missing the required placeholders. '.repeat(10) + 'It has lots of text but no special tokens.';
    writeCustomTemplate(longTemplate);
    const result = await buildNewsletterEditionPrompt({
      episodeNotes: mockNotes,
      userEmail,
      editionDate,
      promptTemplatePath: customTemplatePath
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/placeholders/);
  });

  it('returns error if template file does not exist', async () => {
    const result = await buildNewsletterEditionPrompt({
      episodeNotes: mockNotes,
      userEmail,
      editionDate,
      promptTemplatePath: 'does-not-exist.md'
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to load/);
  });
});

describe('validateEpisodeNotesForNewsletter', () => {
  it('validates and warns for short/long notes', () => {
    const notes = [
      'Short',
      ' '.repeat(10),
      'A very long note '.repeat(1000)
    ];
    const result = validateEpisodeNotesForNewsletter(notes);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes('short'))).toBe(true);
    expect(result.warnings.some(w => w.includes('long'))).toBe(true);
  });

  it('returns invalid for empty array', () => {
    const result = validateEpisodeNotesForNewsletter([]);
    expect(result.isValid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('sanitizeNewsletterContent', () => {
  it('removes unsafe HTML and preserves allowed tags', () => {
    const unsafe = '<h1>Title</h1><script>alert(1)</script><p><a href="http://x.com" onclick="evil()">link</a></p>';
    const safe = sanitizeNewsletterContent(unsafe);
    expect(safe).toContain('<h1>Title</h1>');
    expect(safe).toContain('<a href="http://x.com"');
    expect(safe).not.toContain('script');
    expect(safe).not.toContain('onclick');
  });

  it('preserves inline styles and email-safe attributes', () => {
    const html = '<p style="color:#123456;font-size:16px;">Styled</p>';
    const safe = sanitizeNewsletterContent(html);
    expect(safe).toContain('color:#123456');
    expect(safe).toContain('font-size:16px');
  });
}); 