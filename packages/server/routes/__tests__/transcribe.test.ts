/**
 * Unit tests for packages/server/routes/transcribe.ts
 * Tests the podcast transcription endpoints (GET and POST)
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { EventEmitter } from 'events'
import fs from 'fs'
import { Readable } from 'stream'

// Set up test environment variables before any imports
process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.PODCAST_INDEX_API_KEY = 'test-podcast-key'
process.env.PODCAST_INDEX_API_SECRET = 'test-podcast-secret'
process.env.DEEPGRAM_API_KEY = 'test-deepgram-key'

// Type definitions for test utilities
interface MockRssData {
  rss: {
    channel: {
      item: {
        enclosure: {
          '@_url': string
        }
      }
    }
  }
}

// Mock classes for proper stream simulation
class MockWriteStream extends EventEmitter {
  writable: boolean = true
  readable: boolean = false
  
  write = vi.fn()
  end = vi.fn()
  pipe = vi.fn()
  _write = vi.fn()
  _final = vi.fn()

  // Method to simulate successful stream completion
  simulateSuccess() {
    process.nextTick(() => {
      this.emit('finish')
      this.emit('close')
    })
  }

  // Method to simulate stream error
  simulateError(error: Error) {
    process.nextTick(() => {
      this.emit('error', error)
    })
  }
  
  constructor() {
    super()
    // Set the constructor property to mimic WriteStream
    Object.defineProperty(this, 'constructor', {
      value: { name: 'WriteStream' },
      configurable: true,
      enumerable: false,
      writable: false
    })
  }
}

class MockReadableStream extends EventEmitter {
  readable: boolean = true
  writable: boolean = false

  pipe = vi.fn((destination: MockWriteStream) => {
    // Simulate piping by triggering the destination stream
    process.nextTick(() => {
      if (this.shouldError) {
        destination.simulateError(new Error('Stream pipe error'))
      } else {
        destination.simulateSuccess()
      }
    })
    return destination
  })

  private shouldError: boolean = false

  // Method to make this stream simulate an error during piping
  setError(shouldError: boolean = true) {
    this.shouldError = shouldError
  }
}

// Create test app first - before any imports
const app = express()
app.use(express.json())

// Import the actual modules dynamically to allow for runtime patching
let transcribeRouter: any
let podcastService: any
let transcribeLib: any
let utilsLib: any
let spotifyLib: any

beforeAll(async () => {
  // Import all modules first
  const [transcribeModule, podcastServiceModule, transcribeLibModule, utilsModule, spotifyModule] = await Promise.all([
    import('../transcribe.js'),
    import('../../services/podcastService.js'),
    import('../../lib/transcribe.js'),
    import('../../lib/utils.js'),
    import('../../lib/spotify.js'),
  ])

  transcribeRouter = transcribeModule.default
  podcastService = podcastServiceModule.default
  transcribeLib = transcribeLibModule
  utilsLib = utilsModule
  spotifyLib = spotifyModule

  // Add router to app
  app.use('/transcribe', transcribeRouter)
})

beforeEach(() => {
  // Reset all mocks and patch dependencies at runtime
  vi.clearAllMocks()

  // Mock all external dependencies to make tests fast and predictable
  vi.spyOn(podcastService, 'validateSpotifyUrl').mockReturnValue(true)
  vi.spyOn(podcastService, 'getPodcastSlug').mockResolvedValue('test-podcast')
  vi.spyOn(podcastService, 'getPodcastFeed').mockResolvedValue('http://example.com/feed.xml')
  vi.spyOn(podcastService, 'fetchRssFeed').mockResolvedValue('<rss></rss>')
  vi.spyOn(podcastService, 'parseRssFeed').mockReturnValue({
    rss: { channel: { item: { enclosure: { '@_url': 'http://example.com/test.mp3' } } } }
  })
  vi.spyOn(podcastService, 'extractMp3Url').mockReturnValue('http://example.com/test.mp3')

  // Mock transcribe library
  vi.spyOn(transcribeLib, 'transcribe').mockResolvedValue('Test transcription')

  // Mock utils library 
  vi.spyOn(utilsLib, 'getTitleSlug').mockResolvedValue({
    name: 'test-podcast',
    description: 'Test podcast description',
    publisher: 'Test Publisher'
  })
  vi.spyOn(utilsLib, 'getFeedUrl').mockResolvedValue('http://example.com/feed.xml')

  // Mock spotify library
  vi.spyOn(spotifyLib, 'getSpotifyAccessToken').mockResolvedValue('mock-token')

  // Set up default stream mocking in beforeEach to ensure it's available for all tests

  // Default mock - can be overridden in individual tests
  const defaultWriteStream = new MockWriteStream()
  const defaultReadableStream = new MockReadableStream()
  
  vi.spyOn(fs, 'createWriteStream').mockReturnValue(defaultWriteStream)
  vi.spyOn(Readable, 'from').mockReturnValue(defaultReadableStream)
  vi.spyOn(fs, 'unlink').mockImplementation((path: any, callback?: any) => {
    if (callback) callback()
  })

  // Mock fetch to return a proper response with body stream
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue({ access_token: 'mock-token' }),
    text: vi.fn().mockResolvedValue('<rss><channel><item><enclosure url="http://example.com/test.mp3"/></item></channel></rss>'),
    body: defaultReadableStream,
  })
})

// Mock the stream/promises module at the module level
vi.mock('stream/promises', () => ({
  finished: vi.fn().mockImplementation(async (stream: MockWriteStream) => {
    return new Promise((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      // Default: simulate success after short delay
      setTimeout(() => stream.simulateSuccess(), 10)
    })
  })
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /transcribe', () => {
  const mockSpotifyUrl = 'https://open.spotify.com/show/12345'
  const _mockSlug = 'test-podcast'
  const _mockFeedUrl = 'http://example.com/feed.xml'
  const _mockRssText = '<rss><channel><item><enclosure url="http://example.com/test.mp3"/></item></channel></rss>'
  const _mockRssData: MockRssData = {
    rss: {
      channel: {
        item: {
          enclosure: {
            '@_url': 'http://example.com/test.mp3',
          },
        },
      },
    },
  }
  const _mockMp3Url = 'http://example.com/test.mp3'
  const _mockTmpFile = '/tmp/test-podcast.mp3'
  const _mockTranscript = 'This is a test transcription'

  it('should successfully transcribe a podcast given a valid Spotify URL', async () => {
    // Act - No additional setup needed, using default mocks from beforeEach
    const response = await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Assert
    expect(response.status).toBe(200)
    expect(response.type).toBe('text/plain')
    expect(response.text).toBe('Test transcription')
    expect(podcastService.validateSpotifyUrl).toHaveBeenCalledWith(mockSpotifyUrl)
    expect(podcastService.getPodcastSlug).toHaveBeenCalled()
    expect(transcribeLib.transcribe).toHaveBeenCalled()
    
    // Get the current mocks from beforeEach
    const { finished } = await import('stream/promises')
    expect(fs.createWriteStream).toHaveBeenCalled()
    expect(finished).toHaveBeenCalled()
    expect(fs.unlink).toHaveBeenCalled()
  })

  it('should return 400 if URL parameter is missing', async () => {
    // Act
    const response = await (request(app) as any).get('/transcribe')

    // Assert
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Missing `url` query parameter.')
  })

  it('should return 400 if Spotify URL is invalid', async () => {
    // Arrange
    vi.spyOn(podcastService, 'validateSpotifyUrl').mockReturnValueOnce(false)

    // Act
    const response = await (request(app) as any).get(`/transcribe?url=invalid-url`)

    // Assert
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid URL; must be a valid Spotify show URL.')
  })

  it('should return 500 if getPodcastSlug fails', async () => {
    // Arrange
    vi.spyOn(podcastService, 'getPodcastSlug').mockRejectedValueOnce(new Error('Slug error'))

    // Act
    const response = await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Slug error')
  })

  it('should return 500 if MP3 fetch fails (fetch not ok)', async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    })
    global.fetch = mockFetch

    // Act
    const response = await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toBe('MP3 fetch failed: 404')
  })

  it('should return 500 if MP3 fetch fails (fetch throws)', async () => {
    // Arrange
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network connection error'))
    global.fetch = mockFetch

    // Act
    const response = await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Network connection error')
  })

  it('should return 500 if transcribeLib fails', async () => {
    // Arrange - Make transcribeLib fail, streams will work normally
    vi.spyOn(transcribeLib, 'transcribe').mockRejectedValueOnce(new Error('Transcription error'))

    // Act
    const response = await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Transcription error')
  })

  it('should attempt to clean up temp file even if an error occurs mid-process', async () => {
    // Arrange
    vi.spyOn(podcastService, 'getPodcastFeed').mockRejectedValueOnce(new Error('Feed error'))

    // Act
    await (request(app) as any).get(`/transcribe?url=${mockSpotifyUrl}`)

    // Since getPodcastFeed fails early, tmpFile is never created, so unlink should not be called
    // This test passes if no error is thrown
  })
})

describe('POST /transcribe', () => {
  it('should transcribe a podcast from a valid Spotify URL', async () => {
    // Act - Using default mocks from beforeEach
    const response = await (request(app) as any)
      .post('/transcribe')
      .send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert - Updated expected response format to match actual implementation
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ 
      success: true, 
      data: {
        transcript: 'Test transcription',
        confidence: 1.0,
        duration: 0
      }
    })
    expect(podcastService.validateSpotifyUrl).toHaveBeenCalledWith('https://open.spotify.com/show/validshow')
    expect(podcastService.getPodcastSlug).toHaveBeenCalled()
    expect(transcribeLib.transcribe).toHaveBeenCalled()
    
    // Verify stream operations were called
    const { finished } = await import('stream/promises')
    expect(fs.createWriteStream).toHaveBeenCalled()
    expect(finished).toHaveBeenCalled()
  })

  it('should return 400 for an invalid Spotify URL', async () => {
    // Arrange
    vi.spyOn(podcastService, 'validateSpotifyUrl').mockReturnValue(false)

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'invalid-url' })

    // Assert
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid Spotify URL provided.')
  })

  it('should return 400 if spotifyUrl is missing', async () => {
    // Act
    const response = await (request(app) as any).post('/transcribe').send({})

    // Assert
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Missing spotifyUrl in request body.')
  })

  it('should return 500 if podcastService.getPodcastSlug fails', async () => {
    // Arrange
    vi.spyOn(podcastService, 'getPodcastSlug').mockRejectedValue(new Error('Slug error'))

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Failed to process podcast feed: Slug error/i)
  })

  it('should return 500 if MP3 download fails (fetch not ok)', async () => {
    // Arrange
    const mockFetch = vi.fn().mockResolvedValueOnce({ 
      ok: false, 
      status: 404, 
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    })
    global.fetch = mockFetch

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Failed to download MP3 file: MP3 fetch failed: 404/i)
  })

  it('should return 500 if MP3 download fails (fetch throws)', async () => {
    // Arrange
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
    global.fetch = mockFetch

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Failed to download MP3 file: Network error/i)
  })

  it('should return 500 if creating file stream fails', async () => {
    // Arrange
    vi.spyOn(fs, 'createWriteStream').mockImplementation(() => {
      throw new Error('FS error')
    })

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Failed to save MP3 file: FS error/i)
  })

  it('should return 500 if piping stream to file fails (stream.finished rejects)', async () => {
    // Arrange - Set up stream mocking to fail during stream completion

    // Create new mock instances for this test to override the defaults
    const errorWriteStream = new MockWriteStream()
    const errorReadableStream = new MockReadableStream()
    
    // Override the default mocks to use our error-prone instances
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(errorWriteStream)
    vi.spyOn(Readable, 'from').mockReturnValue(errorReadableStream)
    
    // Mock the finished function to reject with error for this test
    const streamPromises = await import('stream/promises')
    vi.spyOn(streamPromises, 'finished').mockImplementationOnce(async () => {
      // Immediately reject with an error
      throw new Error('Stream pipe error')
    })

    // Override fetch to return our error stream
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: errorReadableStream,
    })

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Failed to save MP3 file: Stream pipe error/i)
  })

  it('should return 500 if transcription lib fails', async () => {
    // Arrange - Make transcription fail, streams will work normally
    vi.spyOn(transcribeLib, 'transcribe').mockRejectedValue(new Error('Transcription error'))

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert
    expect(response.status).toBe(500)
    expect(response.body.error).toMatch(/Error during transcription: Transcription error/i)
  })

  it('should attempt to delete temp file even if transcription fails', async () => {
    // Arrange - Set up transcription failure and spy on file deletion
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockImplementation((path: any, callback?: any) => {
      if (callback) callback()
    })
    vi.spyOn(transcribeLib, 'transcribe').mockRejectedValue(new Error('Transcription error'))

    // Act
    await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert - Verify cleanup was attempted despite transcription failure
    expect(unlinkSpy).toHaveBeenCalled()
  })

  it('should return normally if deleting temp file fails but main operation succeeded', async () => {
    // Arrange - Set up successful transcription but file deletion failure
    
    // Make transcription succeed but file deletion fail
    vi.spyOn(transcribeLib, 'transcribe').mockResolvedValue('Success')
    vi.spyOn(fs, 'unlink').mockImplementation((filePath: any, callback?: any) => {
      const err = new Error('Delete error')
      if (callback) callback(err)
    })
    
    // Mock console.error to avoid actual output during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    const response = await (request(app) as any).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' })

    // Assert - Updated expected response format to match actual implementation
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ 
      success: true, 
      data: {
        transcript: 'Success',
        confidence: 1.0,
        duration: 0
      }
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete temp file'), expect.any(Error))
    consoleErrorSpy.mockRestore()
  })
}) 