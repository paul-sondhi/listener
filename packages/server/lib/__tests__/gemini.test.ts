/**
 * Unit tests for packages/server/lib/llm/gemini.ts
 * Tests Gemini 1.5 Flash client utility for episode notes generation
 */

import { describe, it, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { generateNewsletterEdition } from '../llm/gemini'
import * as promptBuilder from '../utils/buildNewsletterEditionPrompt'

// Type definitions for test utilities
interface MockGeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
  }>
}

interface MockGeminiErrorResponse {
  error: {
    message: string
    code?: number
  }
}

interface MockFetchResponse {
  ok: boolean
  status: number
  statusText?: string
  json: () => Promise<any>
}

// System Under Test - will be imported dynamically to control environment
let generateEpisodeNotes: (transcript: string, overrides?: any) => Promise<{ notes: string; model: string }>
let GeminiAPIError: new (message: string, statusCode: number, responseBody: string) => Error

describe('Gemini Client Utility', () => {
  let mockFetch: MockInstance
  const originalEnv = process.env

  beforeEach(async () => {
    // Reset modules to ensure clean state
    vi.resetModules()
    
    // Set up environment variables for tests
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'test-api-key-12345',
      GEMINI_MODEL_NAME: 'models/gemini-1.5-flash-latest',
      DEBUG_API: 'false'
    }

    // Create a mock for global fetch
    mockFetch = vi.fn() as MockInstance
    global.fetch = mockFetch as unknown as typeof fetch

    // Dynamically import the gemini module to ensure fresh state
    const geminiModule = await import('../llm/gemini.js')
    generateEpisodeNotes = geminiModule.generateEpisodeNotes
    GeminiAPIError = geminiModule.GeminiAPIError
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    vi.resetAllMocks()
  })

  describe('Environment Validation', () => {
    test('should throw error when GEMINI_API_KEY is missing', async () => {
      // Reset modules and remove API key
      vi.resetModules()
      process.env = { ...originalEnv }
      delete process.env.GEMINI_API_KEY

      // Import the function after unsetting the variable
      const geminiModule = await import('../llm/gemini.js')
      // Call the function and expect it to throw
      await expect(
        geminiModule.generateEpisodeNotes('test transcript')
      ).rejects.toThrow('GEMINI_API_KEY is required but not found in environment variables')
    })

    test('should use default model when GEMINI_MODEL_NAME not set', async () => {
      // Reset modules without model name
      vi.resetModules()
      process.env = {
        ...originalEnv,
        GEMINI_API_KEY: 'test-key'
      }
      delete process.env.GEMINI_MODEL_NAME

      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Generated episode notes' }]
            }
          }]
        } as MockGeminiResponse)
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Re-import module
      const geminiModule = await import('../llm/gemini.js')
      
      await geminiModule.generateEpisodeNotes('test transcript')

      // Should use default model in API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
        expect.any(Object)
      )
    })
  })

  describe('generateEpisodeNotes - Success Cases', () => {
    test('should successfully generate episode notes', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: '**Main Topics:**\n• AI and technology\n• Future trends' }]
            }
          }]
        } as MockGeminiResponse)
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const result = await generateEpisodeNotes('This is a test transcript about AI technology.')

      // Assert
      expect(result).toEqual({
        notes: '**Main Topics:**\n• AI and technology\n• Future trends',
        model: 'gemini-1.5-flash-latest'
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-api-key-12345'
          },
          body: expect.stringContaining('This is a test transcript about AI technology.')
        }
      )
    })

    test('should handle prompt overrides correctly', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Custom analysis result' }]
            }
          }]
        } as MockGeminiResponse)
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const overrides = {
        systemPrompt: 'Custom prompt for analysis',
        temperature: 0.7,
        maxOutputTokens: 1000
      }

      // Act
      await generateEpisodeNotes('test transcript', overrides)

      // Assert
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(requestBody.contents[0].parts[0].text).toBe('Custom prompt for analysis')
      expect(requestBody.generationConfig.temperature).toBe(0.7)
      expect(requestBody.generationConfig.maxOutputTokens).toBe(1000)
    })

    test('should use custom model name from environment', async () => {
      // Reset with custom model
      vi.resetModules()
      process.env = {
        ...originalEnv,
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL_NAME: 'models/gemini-1.5-pro'
      }

      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Generated notes' }]
            }
          }]
        } as MockGeminiResponse)
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Re-import module
      const geminiModule = await import('../llm/gemini.js')
      const result = await geminiModule.generateEpisodeNotes('test')

      expect(result.model).toBe('gemini-1.5-pro')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
        expect.any(Object)
      )
    })
  })

  describe('generateEpisodeNotes - Input Validation', () => {
    test('should throw error for empty transcript', async () => {
      await expect(generateEpisodeNotes('')).rejects.toThrow('transcript must be a non-empty string')
    })

    test('should throw error for non-string transcript', async () => {
      await expect(generateEpisodeNotes(null as any)).rejects.toThrow('transcript must be a non-empty string')
      await expect(generateEpisodeNotes(123 as any)).rejects.toThrow('transcript must be a non-empty string')
    })
  })

  describe('generateEpisodeNotes - API Error Handling', () => {
    test('should throw GeminiAPIError on non-200 response', async () => {
      // Arrange
      const mockErrorResponse: MockFetchResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            message: 'API key not valid',
            code: 401
          }
        } as MockGeminiErrorResponse)
      }
      mockFetch.mockResolvedValue(mockErrorResponse) // Use mockResolvedValue instead of mockResolvedValueOnce

      // Act & Assert
      await expect(generateEpisodeNotes('test transcript')).rejects.toThrow('Gemini API request failed: API key not valid')
      
      try {
        await generateEpisodeNotes('test transcript')
      } catch (error) {
        expect(error).toBeInstanceOf(GeminiAPIError)
        expect((error as any).statusCode).toBe(401)
        expect((error as any).responseBody).toContain('API key not valid')
      }
    })

    test('should throw GeminiAPIError when no candidates returned', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [] })
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act & Assert
      await expect(generateEpisodeNotes('test transcript')).rejects.toThrow('No candidates returned from Gemini API')
    })

    test('should throw GeminiAPIError when no text content found', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: []
            }
          }]
        })
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act & Assert
      await expect(generateEpisodeNotes('test transcript')).rejects.toThrow('No text content found in Gemini API response')
    })

    test('should handle network errors', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      // Act & Assert
      await expect(generateEpisodeNotes('test transcript')).rejects.toThrow('Unexpected error calling Gemini API: Network error')
    })

    test('should handle JSON parsing errors', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON') }
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act & Assert
      await expect(generateEpisodeNotes('test transcript')).rejects.toThrow('Unexpected error calling Gemini API: Invalid JSON')
    })
  })

  describe('GeminiAPIError Class', () => {
    test('should create error with correct properties', () => {
      const error = new GeminiAPIError('Test error message', 400, '{"error": "test"}')
      
      expect(error.message).toBe('Test error message')
      expect(error.statusCode).toBe(400)
      expect(error.responseBody).toBe('{"error": "test"}')
      expect(error.name).toBe('GeminiAPIError')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('Request Structure', () => {
    test('should send correct request structure to Gemini API', async () => {
      // Arrange
      const mockResponse: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'test response' }]
            }
          }]
        } as MockGeminiResponse)
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      await generateEpisodeNotes('test transcript')

      // Assert
      const [url, options] = mockFetch.mock.calls[0]
      
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')
      expect(options.headers['x-goog-api-key']).toBe('test-api-key-12345')

      const requestBody = JSON.parse(options.body)
      expect(requestBody).toHaveProperty('contents')
      expect(requestBody).toHaveProperty('generationConfig')
      expect(requestBody.contents[0].parts[0].text).toContain('test transcript')
      expect(requestBody.generationConfig.temperature).toBe(0.3)
      expect(requestBody.generationConfig.maxOutputTokens).toBe(8192)
    })
  })
})

const mockNotes = [
  'Episode 1: Discussed AI trends, key takeaways on LLMs, and notable quotes from Sam Altman.',
  'Episode 2: Deep dive into podcast analytics, audience growth, and monetization strategies.',
  'Episode 3: Interview with Jane Doe about podcast storytelling and creative workflows.'
]
const userEmail = 'testuser@example.com'
const editionDate = '2025-01-27'

const mockHtml = '<h1>Newsletter</h1><p>Welcome!</p>'
const sanitizedHtml = '<h1>Newsletter</h1><p>Welcome!</p>'
const mockMetadata = [
  { showTitle: 'AI Podcast', spotifyUrl: 'https://open.spotify.com/show/ai-podcast' },
  { showTitle: 'Podcast Analytics Show', spotifyUrl: 'https://open.spotify.com/show/analytics' },
  { showTitle: 'Creative Storytelling', spotifyUrl: 'https://open.spotify.com/show/storytelling' }
]

// --- Mock fetch globally ---
let originalFetch: any
beforeEach(() => {
  originalFetch = global.fetch
})
afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('generateNewsletterEdition', () => {
  it('returns sanitized newsletter HTML on success', async () => {
    // Mock Gemini API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: mockHtml }] } }
        ]
      })
    })
    // Spy on sanitizeNewsletterContent to ensure it's called
    const sanitizeSpy = vi.spyOn(promptBuilder, 'sanitizeNewsletterContent')
    sanitizeSpy.mockImplementation((_html) => sanitizedHtml)

    const result = await generateNewsletterEdition(mockNotes, userEmail, editionDate, mockMetadata)
    expect(result.success).toBe(true)
    expect(result.htmlContent).toBe(mockHtml)
    expect(result.sanitizedContent).toBe(sanitizedHtml)
    expect(result.episodeCount).toBe(3)
    expect(result.model).toBeDefined()
    expect(sanitizeSpy).toHaveBeenCalledWith(mockHtml)
  })

  it('returns error if Gemini API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad request' } })
    })
    const result = await generateNewsletterEdition(mockNotes, userEmail, editionDate, mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Gemini API request failed/)
    expect(result.htmlContent).toBe('')
    expect(result.sanitizedContent).toBe('')
  })

  it('returns error if Gemini API returns no candidates', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] })
    })
    const result = await generateNewsletterEdition(mockNotes, userEmail, editionDate, mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No candidates returned/)
  })

  it('returns error if Gemini API returns no text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{}] } }] })
    })
    const result = await generateNewsletterEdition(mockNotes, userEmail, editionDate, mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No HTML content found/)
  })

  it('returns error if input is invalid (empty notes)', async () => {
    const result = await generateNewsletterEdition([], userEmail, editionDate, [])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/empty/)
  })

  it('returns error if input is invalid (bad email)', async () => {
    // @ts-expect-error - Testing invalid email parameter
    const result = await generateNewsletterEdition(mockNotes, '', editionDate, mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/userEmail/)
  })

  it('returns error if input is invalid (bad date)', async () => {
    // @ts-expect-error - Testing invalid date parameter
    const result = await generateNewsletterEdition(mockNotes, userEmail, 'bad-date', mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/editionDate/)
  })

  it('returns error if prompt builder returns error', async () => {
    // Spy on prompt builder to force an error
    vi.spyOn(promptBuilder, 'buildNewsletterEditionPrompt').mockResolvedValue({
      prompt: '',
      template: '',
      episodeCount: 0,
      success: false,
      error: 'Prompt builder failed!'
    })
    const result = await generateNewsletterEdition(mockNotes, userEmail, editionDate, mockMetadata)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Prompt builder failed/)
  })
}) 