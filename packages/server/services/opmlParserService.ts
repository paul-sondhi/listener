/**
 * OPML Parser Service
 * 
 * Parses OPML (Outline Processor Markup Language) files to extract podcast RSS feeds.
 * OPML is commonly used by podcast apps to export/import subscription lists.
 * 
 * This service:
 * - Parses OPML XML structure
 * - Extracts RSS feed URLs and podcast titles
 * - Validates RSS feed URLs
 * - Returns structured data for import
 */

import { XMLParser } from 'fast-xml-parser';
import fetch from 'node-fetch';

export interface ParsedPodcast {
  title: string;
  rssUrl: string;
  isValid?: boolean;
  validationError?: string;
}

export interface OPMLParseResult {
  success: boolean;
  podcasts: ParsedPodcast[];
  error?: string;
  totalCount: number;
  validCount: number;
}

interface OPMLOutline {
  '@_type'?: string;
  '@_text'?: string;
  '@_title'?: string;
  '@_xmlUrl'?: string;
  '@_htmlUrl'?: string;
  outline?: OPMLOutline | OPMLOutline[];
}

interface OPMLDocument {
  opml?: {
    head?: {
      title?: string;
    };
    body?: {
      outline?: OPMLOutline | OPMLOutline[];
    };
  };
}

export class OPMLParserService {
  private parser: XMLParser;
  private readonly RSS_VALIDATION_TIMEOUT = 10000; // 10 seconds

  constructor() {
    // Configure XML parser with attribute prefix for easier parsing
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });
  }

  /**
   * Parse OPML content and extract podcast feeds
   * @param opmlContent - The OPML XML content as a string
   * @returns Parsed podcast information
   */
  async parseOPML(opmlContent: string): Promise<OPMLParseResult> {
    try {
      console.log('[OPML_PARSER] Starting OPML parsing');
      
      // Parse XML
      const parsed = this.parser.parse(opmlContent) as OPMLDocument;
      
      if (!parsed.opml) {
        return {
          success: false,
          podcasts: [],
          error: 'Invalid OPML structure: missing opml element',
          totalCount: 0,
          validCount: 0
        };
      }
      
      if (!parsed.opml.body) {
        // Allow empty body (no subscriptions)
        return {
          success: true,
          podcasts: [],
          totalCount: 0,
          validCount: 0
        };
      }

      // Extract podcasts from outline elements
      const podcasts = this.extractPodcasts(parsed.opml.body.outline);
      console.log(`[OPML_PARSER] Extracted ${podcasts.length} podcasts from OPML`);

      // Handle empty OPML as valid (user might have no subscriptions)
      if (podcasts.length === 0) {
        return {
          success: true,
          podcasts: [],
          totalCount: 0,
          validCount: 0
        };
      }

      // Validate RSS URLs
      const validatedPodcasts = await this.validatePodcasts(podcasts);
      const validCount = validatedPodcasts.filter(p => p.isValid).length;

      console.log(`[OPML_PARSER] Validation complete: ${validCount}/${podcasts.length} valid feeds`);

      return {
        success: true,
        podcasts: validatedPodcasts,
        totalCount: validatedPodcasts.length,
        validCount
      };
    } catch (error) {
      console.error('[OPML_PARSER] Error parsing OPML:', error);
      return {
        success: false,
        podcasts: [],
        error: `Failed to parse OPML: ${error instanceof Error ? error.message : 'Unknown error'}`,
        totalCount: 0,
        validCount: 0
      };
    }
  }

  /**
   * Extract podcast information from OPML outline elements
   * @param outline - The outline element(s) from OPML
   * @returns Array of parsed podcasts
   */
  private extractPodcasts(outline?: OPMLOutline | OPMLOutline[]): ParsedPodcast[] {
    const podcasts: ParsedPodcast[] = [];

    if (!outline) {
      return podcasts;
    }

    // Handle both single outline and array of outlines
    const outlines = Array.isArray(outline) ? outline : [outline];

    for (const item of outlines) {
      // Check if this is an RSS feed outline
      if (item['@_type'] === 'rss' && item['@_xmlUrl']) {
        const title = item['@_text'] || item['@_title'] || 'Untitled Podcast';
        const rssUrl = item['@_xmlUrl'];

        podcasts.push({
          title: title.trim(),
          rssUrl: rssUrl.trim()
        });
      }

      // Recursively process nested outlines (for grouped OPML files)
      if (item.outline) {
        const nestedPodcasts = this.extractPodcasts(item.outline);
        podcasts.push(...nestedPodcasts);
      }
    }

    return podcasts;
  }

  /**
   * Validate podcast RSS URLs
   * @param podcasts - Array of parsed podcasts
   * @returns Array of podcasts with validation status
   */
  private async validatePodcasts(podcasts: ParsedPodcast[]): Promise<ParsedPodcast[]> {
    const validationPromises = podcasts.map(async (podcast) => {
      const validation = await this.validateRSSUrl(podcast.rssUrl);
      return {
        ...podcast,
        isValid: validation.isValid,
        validationError: validation.error
      };
    });

    return Promise.all(validationPromises);
  }

  /**
   * Validate a single RSS URL
   * @param url - The RSS feed URL to validate
   * @returns Validation result
   */
  private async validateRSSUrl(url: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Check URL format
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, error: 'Invalid protocol: must be http or https' };
      }

      // Attempt HEAD request to verify feed is reachable
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.RSS_VALIDATION_TIMEOUT);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Listener/1.0 (Podcast Aggregator)'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return { isValid: true };
        } else {
          return { 
            isValid: false, 
            error: `HTTP ${response.status}: ${response.statusText}` 
          };
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.log(`[OPML_PARSER] Validation timeout for ${url}`);
          return { isValid: false, error: 'Request timeout' };
        }
        
        console.log(`[OPML_PARSER] Validation error for ${url}:`, fetchError.message);
        return { isValid: false, error: fetchError.message };
      }
    } catch (error) {
      // Invalid URL format
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Invalid URL format' 
      };
    }
  }

  /**
   * Validate OPML file size
   * @param sizeInBytes - File size in bytes
   * @returns true if size is acceptable
   */
  static isValidFileSize(sizeInBytes: number): boolean {
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
    return sizeInBytes <= maxSizeInBytes;
  }
}