/**
 * Tests for OPML Parser Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OPMLParserService } from '../opmlParserService';
import fetch from 'node-fetch';

// Mock node-fetch
vi.mock('node-fetch');
const mockFetch = vi.mocked(fetch);

describe('OPMLParserService', () => {
  let service: OPMLParserService;

  beforeEach(() => {
    service = new OPMLParserService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseOPML', () => {
    it('should parse a simple OPML file with RSS feeds', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <head>
            <title>My Podcast Subscriptions</title>
          </head>
          <body>
            <outline type="rss" text="The Daily" xmlUrl="https://feeds.simplecast.com/54nAGcIl" />
            <outline type="rss" text="Planet Money" xmlUrl="https://feeds.npr.org/510289/podcast.xml" />
          </body>
        </opml>`;

      // Mock successful HEAD requests
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.podcasts).toHaveLength(2);
      expect(result.podcasts[0]).toEqual({
        title: 'The Daily',
        rssUrl: 'https://feeds.simplecast.com/54nAGcIl',
        isValid: true
      });
      expect(result.podcasts[1]).toEqual({
        title: 'Planet Money',
        rssUrl: 'https://feeds.npr.org/510289/podcast.xml',
        isValid: true
      });
    });

    it('should handle nested outline structure', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline text="News">
              <outline type="rss" text="BBC News" xmlUrl="https://bbc.com/news/rss.xml" />
              <outline type="rss" text="CNN" xmlUrl="https://cnn.com/rss.xml" />
            </outline>
            <outline text="Tech">
              <outline type="rss" text="Tech News" xmlUrl="https://technews.com/rss.xml" />
            </outline>
          </body>
        </opml>`;

      mockFetch.mockResolvedValue({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(3);
      expect(result.podcasts).toHaveLength(3);
      expect(result.podcasts.map(p => p.title)).toEqual(['BBC News', 'CNN', 'Tech News']);
    });

    it('should use title attribute when text is missing', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" title="Podcast Title" xmlUrl="https://example.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockResolvedValue({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.podcasts[0].title).toBe('Podcast Title');
    });

    it('should handle OPML without body as empty subscriptions', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <head><title>Test</title></head>
        </opml>`;

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(0);
      expect(result.podcasts).toHaveLength(0);
    });

    it('should handle malformed XML', async () => {
      const opmlContent = `<opml><body><outline type="rss" text="Test"`;

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse OPML');
      expect(result.totalCount).toBe(0);
    });

    it('should handle invalid OPML structure without opml element', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <notopml>
          <body><outline type="rss" text="Test" xmlUrl="https://example.com/rss.xml" /></body>
        </notopml>`;

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OPML structure');
      expect(result.totalCount).toBe(0);
    });

    it('should skip non-RSS outline items', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Podcast 1" xmlUrl="https://example1.com/rss.xml" />
            <outline type="link" text="Website" htmlUrl="https://example.com" />
            <outline text="Just a folder" />
            <outline type="rss" text="Podcast 2" xmlUrl="https://example2.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockResolvedValue({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.podcasts).toHaveLength(2);
      expect(result.podcasts.map(p => p.title)).toEqual(['Podcast 1', 'Podcast 2']);
    });
  });

  describe('RSS URL validation', () => {
    it('should validate reachable RSS feeds', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Valid Feed" xmlUrl="https://valid.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(true);
      expect(result.podcasts[0].validationError).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://valid.com/rss.xml',
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({
            'User-Agent': 'Listener/1.0 (Podcast Aggregator)'
          })
        })
      );
    });

    it('should mark unreachable feeds as invalid', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="404 Feed" xmlUrl="https://notfound.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(false);
      expect(result.podcasts[0].validationError).toBe('HTTP 404: Not Found');
      expect(result.validCount).toBe(0);
    });

    it('should handle timeout during validation', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Slow Feed" xmlUrl="https://slow.com/rss.xml" />
          </body>
        </opml>`;

      // Simulate timeout by rejecting with AbortError
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(false);
      expect(result.podcasts[0].validationError).toBe('Request timeout');
    });

    it('should reject non-HTTP(S) URLs', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="FTP Feed" xmlUrl="ftp://example.com/rss.xml" />
            <outline type="rss" text="File Feed" xmlUrl="file:///local/rss.xml" />
          </body>
        </opml>`;

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(false);
      expect(result.podcasts[0].validationError).toContain('Invalid protocol');
      expect(result.podcasts[1].isValid).toBe(false);
      expect(result.podcasts[1].validationError).toContain('Invalid protocol');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network errors during validation', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Network Error" xmlUrl="https://error.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(false);
      expect(result.podcasts[0].validationError).toBe('Network error');
    });

    it('should handle invalid URL format', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Bad URL" xmlUrl="not-a-valid-url" />
          </body>
        </opml>`;

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].isValid).toBe(false);
      expect(result.podcasts[0].validationError).toContain('Invalid URL');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should validate multiple feeds independently', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="Valid Feed" xmlUrl="https://valid.com/rss.xml" />
            <outline type="rss" text="Invalid Feed" xmlUrl="https://invalid.com/rss.xml" />
            <outline type="rss" text="Another Valid" xmlUrl="https://valid2.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch
        .mockResolvedValueOnce({ ok: true } as any)
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' } as any)
        .mockResolvedValueOnce({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.totalCount).toBe(3);
      expect(result.validCount).toBe(2);
      expect(result.podcasts[0].isValid).toBe(true);
      expect(result.podcasts[1].isValid).toBe(false);
      expect(result.podcasts[2].isValid).toBe(true);
    });
  });

  describe('isValidFileSize', () => {
    it('should accept files under 5MB', () => {
      expect(OPMLParserService.isValidFileSize(1024 * 1024)).toBe(true); // 1MB
      expect(OPMLParserService.isValidFileSize(4 * 1024 * 1024)).toBe(true); // 4MB
      expect(OPMLParserService.isValidFileSize(5 * 1024 * 1024)).toBe(true); // 5MB exactly
    });

    it('should reject files over 5MB', () => {
      expect(OPMLParserService.isValidFileSize(5 * 1024 * 1024 + 1)).toBe(false); // 5MB + 1 byte
      expect(OPMLParserService.isValidFileSize(10 * 1024 * 1024)).toBe(false); // 10MB
    });
  });

  describe('edge cases', () => {
    it('should handle empty OPML file', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <head><title>Empty Subscriptions</title></head>
          <body></body>
        </opml>`;

      const result = await service.parseOPML(opmlContent);

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(0);
      expect(result.podcasts).toHaveLength(0);
    });

    it('should trim whitespace from titles and URLs', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" text="  Podcast Title  " xmlUrl="  https://example.com/rss.xml  " />
          </body>
        </opml>`;

      mockFetch.mockResolvedValue({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].title).toBe('Podcast Title');
      expect(result.podcasts[0].rssUrl).toBe('https://example.com/rss.xml');
    });

    it('should provide default title for untitled podcasts', async () => {
      const opmlContent = `<?xml version="1.0" encoding="utf-8"?>
        <opml version="1.0">
          <body>
            <outline type="rss" xmlUrl="https://example.com/rss.xml" />
          </body>
        </opml>`;

      mockFetch.mockResolvedValue({ ok: true } as any);

      const result = await service.parseOPML(opmlContent);

      expect(result.podcasts[0].title).toBe('Untitled Podcast');
    });
  });
});