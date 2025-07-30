import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNewsletterSubjectLine } from '../gemini';
import * as fs from 'fs';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock fs.readFileSync
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

describe('generateNewsletterSubjectLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set required environment variables
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test'; // Skip rate limiting
    
    // Mock the prompt template
    vi.mocked(fs.readFileSync).mockReturnValue(
      '# Subject Line Prompt\n\nGenerate a subject line:\n\n[NEWSLETTER_HTML_CONTENT]'
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('successful generation', () => {
    it('should generate a subject line successfully', async () => {
      const mockSubjectLine = 'AI Ethics, Climate Tech & Startup Insights';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: mockSubjectLine }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const htmlContent = '<h2>Today\'s Podcast Insights</h2><p>AI ethics discussion...</p>';
      const result = await generateNewsletterSubjectLine(htmlContent);

      expect(result).toEqual({
        subjectLine: mockSubjectLine,
        success: true,
        wordCount: 7 // "&" is counted as a separate word
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining(htmlContent)
        })
      );
    });

    it('should handle custom prompt template path', async () => {
      const customPromptPath = '/custom/path/prompt.md';
      const customPrompt = 'Custom prompt: [NEWSLETTER_HTML_CONTENT]';
      
      vi.mocked(fs.readFileSync).mockReturnValueOnce(customPrompt);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Custom Subject Line' }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>', customPromptPath);

      expect(result.success).toBe(true);
      expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(customPromptPath, 'utf-8');
    });

    it('should count words correctly', async () => {
      const testCases = [
        { subject: 'AI Ethics', expectedCount: 2 },
        { subject: 'Tech News & Updates', expectedCount: 4 },
        { subject: 'One', expectedCount: 1 },
        { subject: 'This Is A Ten Word Subject Line For Testing Purposes', expectedCount: 10 },
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: testCase.subject }],
                role: 'model'
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: []
            }]
          })
        });

        const result = await generateNewsletterSubjectLine('<p>Test</p>');
        expect(result.wordCount).toBe(testCase.expectedCount);
      }
    });

    it('should NOT truncate subject lines exceeding 10 words', async () => {
      const longSubject = 'This Is A Very Long Subject Line That Exceeds The Ten Word Maximum Limit Set';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: longSubject }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result.success).toBe(true);
      expect(result.wordCount).toBe(15); // Count all words
      expect(result.subjectLine).toBe(longSubject); // Full subject line returned
    });

    it('should trim whitespace from generated subject lines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: '  AI Ethics & Tech News  ' }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result.subjectLine).toBe('AI Ethics & Tech News');
      expect(result.wordCount).toBe(5);
    });
  });

  describe('error handling', () => {
    it('should handle missing GEMINI_API_KEY', async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(generateNewsletterSubjectLine('<p>Content</p>'))
        .rejects.toThrow('GEMINI_API_KEY is required but not found');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
            code: 429
          }
        })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result).toEqual({
        subjectLine: '',
        success: false,
        error: expect.stringContaining('Rate limit exceeded'),
        wordCount: 0
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result).toEqual({
        subjectLine: '',
        success: false,
        error: 'Network error',
        wordCount: 0
      });
    });

    it('should handle missing subject line in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subject line generated');
    });

    it('should handle prompt file read errors', async () => {
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read subject line prompt template');
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'response' })
      });

      const result = await generateNewsletterSubjectLine('<p>Content</p>');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subject line generated');
    });
  });

  describe('rate limiting', () => {
    it('should skip rate limiting in test environment', async () => {
      process.env.NODE_ENV = 'test';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Test Subject' }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: []
          }]
        })
      });

      const startTime = Date.now();
      await generateNewsletterSubjectLine('<p>Content</p>');
      const elapsed = Date.now() - startTime;

      // Should be fast without rate limiting
      expect(elapsed).toBeLessThan(100);
    });
  });
});