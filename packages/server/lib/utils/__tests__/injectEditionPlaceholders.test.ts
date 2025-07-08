import { describe, it, expect } from 'vitest';
import { injectEditionPlaceholders, EditionPlaceholderReplacements } from '../injectEditionPlaceholders.js';

describe('injectEditionPlaceholders', () => {
  it('replaces all supported placeholders', () => {
    const html = `Hello [USER_EMAIL],<br>Date: [EDITION_DATE]<br>Episodes: [EPISODE_COUNT]<br>[FOOTER_TEXT]`;
    const replacements: EditionPlaceholderReplacements = {
      USER_EMAIL: 'test@example.com',
      EDITION_DATE: '2025-07-08',
      EPISODE_COUNT: 3,
      FOOTER_TEXT: 'This is a test footer.'
    };
    const result = injectEditionPlaceholders(html, replacements);
    expect(result).toContain('test@example.com');
    expect(result).toContain('2025-07-08');
    expect(result).toContain('3');
    expect(result).toContain('This is a test footer.');
    expect(result).not.toContain('[USER_EMAIL]');
    expect(result).not.toContain('[EDITION_DATE]');
    expect(result).not.toContain('[EPISODE_COUNT]');
    expect(result).not.toContain('[FOOTER_TEXT]');
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const html = '[USER_EMAIL] [USER_EMAIL] [USER_EMAIL]';
    const replacements: EditionPlaceholderReplacements = {
      USER_EMAIL: 'multi@example.com',
      EDITION_DATE: 'irrelevant',
      EPISODE_COUNT: 0,
      FOOTER_TEXT: ''
    };
    const result = injectEditionPlaceholders(html, replacements);
    expect(result).toBe('multi@example.com multi@example.com multi@example.com');
  });

  it('handles missing placeholders gracefully', () => {
    const html = 'No placeholders here.';
    const replacements: EditionPlaceholderReplacements = {
      USER_EMAIL: 'shouldnotappear',
      EDITION_DATE: 'shouldnotappear',
      EPISODE_COUNT: 0,
      FOOTER_TEXT: 'shouldnotappear'
    };
    const result = injectEditionPlaceholders(html, replacements);
    expect(result).toBe('No placeholders here.');
  });

  it('works with numeric episode count', () => {
    const html = 'Episodes: [EPISODE_COUNT]';
    const replacements: EditionPlaceholderReplacements = {
      USER_EMAIL: '',
      EDITION_DATE: '',
      EPISODE_COUNT: 42,
      FOOTER_TEXT: ''
    };
    const result = injectEditionPlaceholders(html, replacements);
    expect(result).toBe('Episodes: 42');
  });

  it('does not replace partial matches', () => {
    const html = '[USER_EMAILISH] [USER_EMAIL]';
    const replacements: EditionPlaceholderReplacements = {
      USER_EMAIL: 'real',
      EDITION_DATE: '',
      EPISODE_COUNT: 0,
      FOOTER_TEXT: ''
    };
    const result = injectEditionPlaceholders(html, replacements);
    expect(result).toBe('[USER_EMAILISH] real');
  });
}); 