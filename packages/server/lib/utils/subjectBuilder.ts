// Utility to build the subject line for the daily edition email
// Usage: buildSubject(new Date('2025-07-08')) => 'Your Podcast Newsletter: July 8, 2025'
// Usage with subject line: buildSubject(new Date('2025-07-08'), 'AI Ethics, Tech News & Startup Insights') => 'July 8, 2025: AI Ethics, Tech News & Startup Insights'

import { NewsletterEditionWithUser } from '../db/sendNewsletterQueries.js';

/**
 * Builds the subject line for the daily edition email.
 * @param {Date | string} editionDate - The date of the edition (Date object or ISO string)
 * @param {string | null} personalizedSubject - Optional personalized subject line
 * @returns {string} The formatted subject line
 */
export function buildSubject(editionDate: Date | string, personalizedSubject?: string | null): string {
  // Convert to Date object if necessary
  const dateObj = typeof editionDate === 'string' ? new Date(editionDate) : editionDate;
  
  // Check for invalid date
  if (isNaN(dateObj.getTime())) {
    return 'Your Podcast Newsletter: Invalid Date';
  }
  
  // If we have a personalized subject line, use new format
  if (personalizedSubject && personalizedSubject.trim().length > 0) {
    // Format: July 8, 2025: AI Ethics, Tech News & Startup Insights
    const options: Intl.DateTimeFormatOptions = { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC' // Use UTC to avoid timezone issues
    };
    const formattedDate = dateObj.toLocaleDateString('en-US', options);
    return `${formattedDate}: ${personalizedSubject.trim()}`;
  }
  
  // Fallback to original format: Your Podcast Newsletter: July 8, 2025
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'UTC' // Use UTC to avoid timezone issues
  };
  const formattedDate = dateObj.toLocaleDateString('en-US', options);
  return `Your Podcast Newsletter: ${formattedDate}`;
}

/**
 * Builds the subject line for a newsletter edition.
 * Convenience function that accepts a NewsletterEditionWithUser object.
 * @param {NewsletterEditionWithUser} edition - The newsletter edition
 * @returns {string} The formatted subject line
 */
export function buildSubjectForEdition(edition: NewsletterEditionWithUser): string {
  return buildSubject(edition.edition_date, edition.subject_line);
} 