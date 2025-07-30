import { describe, it, expect } from 'vitest';
import { buildSubject, buildSubjectForEdition } from '../subjectBuilder';
import { NewsletterEditionWithUser } from '../../db/sendNewsletterQueries';

// Unit tests for the buildSubject utility

describe('buildSubject', () => {
  describe('with date only (legacy behavior)', () => {
    it('formats a Date object correctly', () => {
      // Use UTC to avoid timezone issues
      const date = new Date('2025-07-08T00:00:00.000Z');
      expect(buildSubject(date)).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('formats an ISO string correctly', () => {
      // Use UTC date string to avoid timezone issues
      expect(buildSubject('2025-07-08T00:00:00.000Z')).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('handles different months and days', () => {
      expect(buildSubject('2025-12-25T00:00:00.000Z')).toBe('🎧 Your Podcast Newsletter: December 25, 2025');
      expect(buildSubject('2025-01-01T00:00:00.000Z')).toBe('🎧 Your Podcast Newsletter: January 1, 2025');
    });

    it('handles invalid date input gracefully', () => {
      // Should return 'Invalid Date' for invalid input
      expect(buildSubject('not-a-date')).toBe('🎧 Your Podcast Newsletter: Invalid Date');
    });

    it('handles Date objects with time', () => {
      const date = new Date('2025-07-08T15:30:00Z');
      expect(buildSubject(date)).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });
  });

  describe('with personalized subject line', () => {
    it('should use personalized format when subject line is provided', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', 'AI Ethics, Tech News & Startup Insights');
      expect(result).toBe('🎧 July 8, 2025: AI Ethics, Tech News & Startup Insights');
    });

    it('should use personalized format with year', () => {
      const result = buildSubject('2025-12-25T00:00:00.000Z', 'Holiday Tech Trends & Innovation');
      expect(result).toBe('🎧 December 25, 2025: Holiday Tech Trends & Innovation');
    });

    it('should fallback to default format when subject line is null', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', null);
      expect(result).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('should fallback to default format when subject line is undefined', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', undefined);
      expect(result).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('should fallback to default format when subject line is empty string', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', '');
      expect(result).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('should fallback to default format when subject line is whitespace only', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', '   ');
      expect(result).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('should trim whitespace from personalized subject', () => {
      const result = buildSubject('2025-07-08T00:00:00.000Z', '  AI Ethics & Tech News  ');
      expect(result).toBe('🎧 July 8, 2025: AI Ethics & Tech News');
    });
  });
});

describe('buildSubjectForEdition', () => {
  it('should build subject from edition with personalized subject', () => {
    const edition: NewsletterEditionWithUser = {
      id: '123',
      user_id: 'user-123',
      edition_date: '2025-07-08',
      status: 'generated',
      user_email: 'test@example.com',
      content: '<p>Newsletter content</p>',
      model: 'gemini-1.5-flash',
      error_message: null,
      created_at: '2025-07-08T12:00:00Z',
      updated_at: '2025-07-08T12:00:00Z',
      deleted_at: null,
      sent_at: null,
      subject_line: 'AI Ethics, Tech News & Startup Insights'
    };

    const result = buildSubjectForEdition(edition);
    expect(result).toBe('🎧 July 8, 2025: AI Ethics, Tech News & Startup Insights');
  });

  it('should build subject from edition without personalized subject', () => {
    const edition: NewsletterEditionWithUser = {
      id: '123',
      user_id: 'user-123',
      edition_date: '2025-07-08',
      status: 'generated',
      user_email: 'test@example.com',
      content: '<p>Newsletter content</p>',
      model: 'gemini-1.5-flash',
      error_message: null,
      created_at: '2025-07-08T12:00:00Z',
      updated_at: '2025-07-08T12:00:00Z',
      deleted_at: null,
      sent_at: null,
      subject_line: null
    };

    const result = buildSubjectForEdition(edition);
    expect(result).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
  });
});

describe('Integration with Send Worker', () => {
  it('should format subject line correctly in email context', () => {
    // Test various date formats used by the send worker
    const editions = [
      {
        edition_date: '2025-07-08',
        subject_line: 'AI Ethics, Tech News & Startup Insights'
      },
      {
        edition_date: '2025-12-25',
        subject_line: null
      },
      {
        edition_date: '2025-01-01',
        subject_line: ''
      }
    ];

    const subjects = editions.map(e => buildSubject(e.edition_date, e.subject_line));
    
    expect(subjects[0]).toBe('🎧 July 8, 2025: AI Ethics, Tech News & Startup Insights');
    expect(subjects[1]).toBe('🎧 Your Podcast Newsletter: December 25, 2025');
    expect(subjects[2]).toBe('🎧 Your Podcast Newsletter: January 1, 2025');
  });
}); 