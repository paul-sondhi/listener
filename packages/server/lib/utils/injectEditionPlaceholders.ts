/**
 * Utility to inject placeholders into newsletter edition HTML.
 *
 * Supported placeholders:
 *   [USER_EMAIL], [EDITION_DATE], [EPISODE_COUNT], [FOOTER_TEXT]
 *
 * @param html The HTML string with placeholders
 * @param replacements An object with keys for each placeholder (no brackets)
 * @returns The HTML string with placeholders replaced
 */
export interface EditionPlaceholderReplacements {
  USER_EMAIL: string;
  EDITION_DATE: string;
  EPISODE_COUNT: string | number;
  FOOTER_TEXT: string;
}

export function injectEditionPlaceholders(
  html: string,
  replacements: EditionPlaceholderReplacements
): string {
  let result = html;
  for (const [key, value] of Object.entries(replacements)) {
    // Replace all occurrences of [KEY] (case-sensitive)
    result = result.replaceAll(`[${key}]`, String(value));
  }
  return result;
} 