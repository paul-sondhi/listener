/**
 * Unit Tests for Send Newsletter Worker Subject Line Functionality
 * 
 * This test suite specifically tests that the send worker correctly
 * uses personalized subject lines when sending emails.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSubject } from '../../lib/utils/subjectBuilder.js';
import type { NewsletterEditionWithUser } from '../../lib/db/sendNewsletterQueries.js';

describe('Send Worker Subject Line Building', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSubject integration with send worker data', () => {
    it('should correctly format subject with personalized subject line', () => {
      const edition: NewsletterEditionWithUser = {
        id: 'edition-1',
        user_id: 'user-1',
        edition_date: '2025-07-08',
        status: 'generated',
        user_email: 'user@example.com',
        content: '<p>Newsletter content</p>',
        model: 'gemini-1.5-flash',
        error_message: null,
        created_at: '2025-07-08T12:00:00Z',
        updated_at: '2025-07-08T12:00:00Z',
        deleted_at: null,
        sent_at: null,
        subject_line: 'AI Ethics, Tech News & Startup Insights'
      };
      
      const subject = buildSubject(edition.edition_date, edition.subject_line);
      expect(subject).toBe('🎧 July 8, 2025: AI Ethics, Tech News & Startup Insights');
    });

    it('should fallback to default subject when subject_line is null', () => {
      const edition: NewsletterEditionWithUser = {
        id: 'edition-2',
        user_id: 'user-2',
        edition_date: '2025-07-08',
        status: 'generated',
        user_email: 'user@example.com',
        content: '<p>Newsletter content</p>',
        model: 'gemini-1.5-flash',
        error_message: null,
        created_at: '2025-07-08T12:00:00Z',
        updated_at: '2025-07-08T12:00:00Z',
        deleted_at: null,
        sent_at: null,
        subject_line: null
      };
      
      const subject = buildSubject(edition.edition_date, edition.subject_line);
      expect(subject).toBe('🎧 Your Podcast Newsletter: July 8, 2025');
    });

    it('should handle empty subject lines as fallback', () => {
      const edition: NewsletterEditionWithUser = {
        id: 'edition-3',
        user_id: 'user-3',
        edition_date: '2025-12-25',
        status: 'generated',
        user_email: 'user@example.com',
        content: '<p>Christmas Newsletter</p>',
        model: 'gemini-1.5-flash',
        error_message: null,
        created_at: '2025-12-25T12:00:00Z',
        updated_at: '2025-12-25T12:00:00Z',
        deleted_at: null,
        sent_at: null,
        subject_line: ''
      };
      
      const subject = buildSubject(edition.edition_date, edition.subject_line);
      expect(subject).toBe('🎧 Your Podcast Newsletter: December 25, 2025');
    });

    it('should handle whitespace-only subject lines as fallback', () => {
      const edition: NewsletterEditionWithUser = {
        id: 'edition-4',
        user_id: 'user-4',
        edition_date: '2025-01-01',
        status: 'generated',
        user_email: 'user@example.com',
        content: '<p>New Year Newsletter</p>',
        model: 'gemini-1.5-flash',
        error_message: null,
        created_at: '2025-01-01T12:00:00Z',
        updated_at: '2025-01-01T12:00:00Z',
        deleted_at: null,
        sent_at: null,
        subject_line: '   '
      };
      
      const subject = buildSubject(edition.edition_date, edition.subject_line);
      expect(subject).toBe('🎧 Your Podcast Newsletter: January 1, 2025');
    });

    it('should simulate send worker subject line usage', () => {
      // This test simulates exactly what the send worker does
      const editionsFromDatabase: NewsletterEditionWithUser[] = [
        {
          id: 'e1',
          user_id: 'u1',
          edition_date: '2025-07-08',
          status: 'generated',
          user_email: 'user1@example.com',
          content: '<p>Content 1</p>',
          model: 'gemini-1.5-flash',
          error_message: null,
          created_at: '2025-07-08T12:00:00Z',
          updated_at: '2025-07-08T12:00:00Z',
          deleted_at: null,
          sent_at: null,
          subject_line: 'AI Ethics & Innovation Updates'
        },
        {
          id: 'e2',
          user_id: 'u2',
          edition_date: '2025-07-09',
          status: 'generated',
          user_email: 'user2@example.com',
          content: '<p>Content 2</p>',
          model: 'gemini-1.5-flash',
          error_message: null,
          created_at: '2025-07-09T12:00:00Z',
          updated_at: '2025-07-09T12:00:00Z',
          deleted_at: null,
          sent_at: null,
          subject_line: null
        }
      ];
      
      // Simulate what happens in sendNewsletterWorker.ts line 168
      const emailSubjects = editionsFromDatabase.map(edition => ({
        to: edition.user_email,
        subject: buildSubject(edition.edition_date, edition.subject_line)
      }));
      
      expect(emailSubjects).toEqual([
        {
          to: 'user1@example.com',
          subject: '🎧 July 8, 2025: AI Ethics & Innovation Updates'
        },
        {
          to: 'user2@example.com',
          subject: '🎧 Your Podcast Newsletter: July 9, 2025'
        }
      ]);
    });
  });
});