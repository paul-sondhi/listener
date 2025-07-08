// Utility to build the subject line for the daily edition email
// Usage: buildSubject(new Date('2025-07-08')) => 'Listener Recap: July 8th, 2025'

/**
 * Builds the subject line for the daily edition email.
 * @param {Date | string} editionDate - The date of the edition (Date object or ISO string)
 * @returns {string} The formatted subject line
 */
export function buildSubject(editionDate: Date | string): string {
  // Convert to Date object if necessary
  const dateObj = typeof editionDate === 'string' ? new Date(editionDate) : editionDate;
  
  // Check for invalid date
  if (isNaN(dateObj.getTime())) {
    return 'Listener Recap: Invalid Date';
  }
  
  // Format: July 8, 2025
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'UTC' // Use UTC to avoid timezone issues
  };
  const formattedDate = dateObj.toLocaleDateString('en-US', options);
  return `Listener Recap: ${formattedDate}`;
} 