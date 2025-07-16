import { describe, it, expect } from 'vitest';
import { buildSubject } from '../subjectBuilder';

// Unit tests for the buildSubject utility

describe('buildSubject', () => {
  it('formats a Date object correctly', () => {
    // Use UTC to avoid timezone issues
    const date = new Date('2025-07-08T00:00:00.000Z');
    expect(buildSubject(date)).toBe('Your Podcast Newsletter: July 8, 2025');
  });

  it('formats an ISO string correctly', () => {
    // Use UTC date string to avoid timezone issues
    expect(buildSubject('2025-07-08T00:00:00.000Z')).toBe('Your Podcast Newsletter: July 8, 2025');
  });

  it('handles different months and days', () => {
    expect(buildSubject('2025-12-25T00:00:00.000Z')).toBe('Your Podcast Newsletter: December 25, 2025');
    expect(buildSubject('2025-01-01T00:00:00.000Z')).toBe('Your Podcast Newsletter: January 1, 2025');
  });

  it('handles invalid date input gracefully', () => {
    // Should return 'Invalid Date' for invalid input
    expect(buildSubject('not-a-date')).toBe('Your Podcast Newsletter: Invalid Date');
  });

  it('handles Date objects with time', () => {
    const date = new Date('2025-07-08T15:30:00Z');
    expect(buildSubject(date)).toBe('Your Podcast Newsletter: July 8, 2025');
  });
}); 