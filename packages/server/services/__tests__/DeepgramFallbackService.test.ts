/**
 * Unit tests for DeepgramFallbackService
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeepgramFallbackService, DeepgramFallbackConfig } from '../DeepgramFallbackService';
import { createClient } from '@deepgram/sdk';

// Mock the Deepgram SDK
vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn()
}));

// Mock fetch for HEAD requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid test output clutter
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
vi.spyOn(console, 'log').mockImplementation(mockConsoleLog);
vi.spyOn(console, 'error').mockImplementation(mockConsoleError);

// Get the mocked function
const mockCreateClient = vi.mocked(createClient);
const mockTranscribeUrl = vi.fn();

describe('DeepgramFallbackService', () => {
  let service: DeepgramFallbackService;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up environment
    process.env = { ...originalEnv };
    process.env.DEEPGRAM_API_KEY = 'test-api-key';
    
    // Set up Deepgram client mock
    mockCreateClient.mockReturnValue({
      listen: {
        prerecorded: {
          transcribeUrl: mockTranscribeUrl
        }
      }
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      service = new DeepgramFallbackService();
      const config = service.getConfig();
      
      expect(config.maxDeepgramFileSizeMB).toBe(500);
      expect(config.deepgramOptions.model).toBe('nova-3');
      expect(config.deepgramOptions.smart_format).toBe(true);
      expect(config.deepgramOptions.diarize).toBe(true);
      expect(config.deepgramOptions.filler_words).toBe(false);
      expect(mockCreateClient).toHaveBeenCalledWith('test-api-key');
    });

    it('should accept custom configuration overrides', () => {
      const customConfig: Partial<DeepgramFallbackConfig> = {
        maxDeepgramFileSizeMB: 100,
        deepgramOptions: {
          model: 'nova-2',
          smart_format: false,
          diarize: false,
          filler_words: true
        }
      };

      const customService = new DeepgramFallbackService(customConfig);
      const config = customService.getConfig();
      
      expect(config.maxDeepgramFileSizeMB).toBe(100);
      expect(config.deepgramOptions.model).toBe('nova-2');
      expect(config.deepgramOptions.smart_format).toBe(false);
      expect(config.deepgramOptions.diarize).toBe(false);
      expect(config.deepgramOptions.filler_words).toBe(true);
    });

    it('should throw error if DEEPGRAM_API_KEY is not set', () => {
      delete process.env.DEEPGRAM_API_KEY;
      
      expect(() => new DeepgramFallbackService()).toThrow('DEEPGRAM_API_KEY environment variable is required');
    });
  });

  describe('transcribeFromUrl', () => {
    const validUrl = 'https://example.com/episode.mp3';
    const mockTranscriptText = 'This is a test transcript from the podcast episode.';

    beforeEach(() => {
      // Mock successful HEAD request
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['content-length', '52428800']]) // 50MB
      });

      // Mock successful Deepgram response
      mockTranscribeUrl.mockResolvedValue({
        result: {
          results: {
            channels: [{
              alternatives: [{
                transcript: mockTranscriptText
              }]
            }]
          }
        },
        error: null
      });
      
      // Initialize service for each test
      service = new DeepgramFallbackService();
    });

    it('should successfully transcribe from valid URL', async () => {
      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(true);
      expect(result.transcript).toBe(mockTranscriptText);
      expect(result.fileSizeMB).toBe(50);
      expect(result.error).toBeUndefined();
      
      // Verify HEAD request was made
      expect(mockFetch).toHaveBeenCalledWith(validUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Listener-Podcast-App/1.0' }
      });
      
      // Verify Deepgram API was called
      expect(mockTranscribeUrl).toHaveBeenCalledWith(
        { url: validUrl },
        service.getConfig().deepgramOptions
      );
    });

    it('should reject invalid URL formats', async () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/file.mp3',
        'javascript:alert("xss")',
        '',
        'file:///local/file.mp3'
      ];

      for (const invalidUrl of invalidUrls) {
        const result = await service.transcribeFromUrl(invalidUrl);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid URL format');
        expect(result.transcript).toBeUndefined();
      }
      
      // Should not make any network requests for invalid URLs
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should reject files that are too large', async () => {
      // Mock HEAD response with large file (600MB)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['content-length', '629145600']]) // 600MB
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('File size 600.0MB exceeds limit of 500MB');
      expect(result.fileSizeMB).toBe(600);
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should handle missing Content-Length header', async () => {
      // Mock HEAD response without Content-Length
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map()
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing Content-Length header - cannot verify file size');
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should handle invalid Content-Length header', async () => {
      // Mock HEAD response with invalid Content-Length
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['content-length', 'not-a-number']])
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Content-Length header: not-a-number');
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should handle HEAD request failures', async () => {
      // Mock failed HEAD request
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('HEAD request failed: 404 Not Found');
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should handle network errors during HEAD request', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error during file size check: Network error');
      expect(mockTranscribeUrl).not.toHaveBeenCalled();
    });

    it('should handle Deepgram API errors', async () => {
      // Mock Deepgram error response
      mockTranscribeUrl.mockResolvedValue({
        result: null,
        error: { message: 'Invalid audio format' }
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Deepgram API error: Invalid audio format');
      expect(result.fileSizeMB).toBe(50);
    });

    it('should handle empty transcript response', async () => {
      // Mock response with no transcript
      mockTranscribeUrl.mockResolvedValue({
        result: {
          results: {
            channels: [{
              alternatives: [{
                transcript: ''
              }]
            }]
          }
        },
        error: null
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No transcript returned from Deepgram API');
      expect(result.fileSizeMB).toBe(50);
    });

    it('should handle malformed Deepgram response structure', async () => {
      // Mock malformed response
      mockTranscribeUrl.mockResolvedValue({
        result: {
          results: null
        },
        error: null
      });

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No transcript returned from Deepgram API');
    });

    it('should handle rate limit errors (429)', async () => {
      // Mock rate limit error
      mockTranscribeUrl.mockRejectedValue(new Error('HTTP 429: Rate limit exceeded'));

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded - too many concurrent requests');
    });

    it('should handle timeout errors (504)', async () => {
      // Mock timeout error
      mockTranscribeUrl.mockRejectedValue(new Error('HTTP 504: Gateway timeout'));

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Transcription timeout - file processing exceeded 10 minutes');
    });

    it('should handle generic transcription errors', async () => {
      // Mock generic error
      mockTranscribeUrl.mockRejectedValue(new Error('Unexpected API error'));

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected API error');
    });

    it('should handle unknown error types', async () => {
      // Mock non-Error object being thrown
      mockTranscribeUrl.mockRejectedValue('String error');

      const result = await service.transcribeFromUrl(validUrl);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown transcription error');
    });
  });


  describe('getConfig', () => {
    it('should return a copy of the current configuration', () => {
      service = new DeepgramFallbackService();
      const config1 = service.getConfig();
      const config2 = service.getConfig();
      
      // Should return the same values
      expect(config1).toEqual(config2);
      
      // But should be different objects (defensive copy)
      expect(config1).not.toBe(config2);
      
      // Modifying returned config shouldn't affect service
      config1.maxDeepgramFileSizeMB = 999;
      expect(service.getConfig().maxDeepgramFileSizeMB).toBe(500);
    });
  });
});