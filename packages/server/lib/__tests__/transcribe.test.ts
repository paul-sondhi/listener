/**
 * Unit tests for packages/server/lib/transcribe.ts
 * Tests the audio transcription functionality using Deepgram SDK
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { Readable } from 'stream'

// Type definitions for test utilities
interface _MockDeepgramClient {
  listen: {
    prerecorded: {
      transcribeFile: MockInstance
    }
  }
}

interface MockTranscriptionResult {
  result: {
    results: {
      channels: Array<{
        alternatives: Array<{
          transcript: string
        }>
      }>
    }
  } | null
  error: Error | null
}

// Hoisted mock for 'fs' with proper TypeScript typing
const mockFsCreateReadStreamFn = vi.fn() as MockInstance
vi.mock('fs', () => ({
  __esModule: true,
  createReadStream: mockFsCreateReadStreamFn,
  default: {
    createReadStream: mockFsCreateReadStreamFn,
  },
}))

// Hoisted mock for '@deepgram/sdk' with proper TypeScript typing
const mockDeepgramCreateClientFn = vi.fn() as MockInstance
vi.mock('@deepgram/sdk', () => ({
  createClient: mockDeepgramCreateClientFn,
}))

// System Under Test and mocks will be imported dynamically
let transcribeSUT: (audioFilePath: string) => Promise<string>
let mockFsCreateReadStream: MockInstance
let mockDeepgramCreateClient: MockInstance
let currentTranscribeFileMockFn: MockInstance

describe('Transcription Service', () => {
  describe('transcribe', () => {
    const originalEnv = process.env
    const mockAudioFilePath = '/test/audio.mp3'
    const mockReadStreamObject = { type: 'mockReadStream' } as unknown as Readable

    beforeEach(async () => {
      // Reset all modules to ensure clean state
      vi.resetModules()

      // Dynamically import the transcribe module to ensure fresh mocks
      const transcribeModule = await import('../transcribe.js')
      transcribeSUT = transcribeModule.transcribe

      // Import fs module and setup mock
      await import('fs')
      mockFsCreateReadStream = mockFsCreateReadStreamFn
      mockFsCreateReadStream.mockReset()
      mockFsCreateReadStream.mockReturnValue(mockReadStreamObject)

      // Import Deepgram SDK and setup mock
      const deepgramSdkModule = await import('@deepgram/sdk')
      mockDeepgramCreateClient = deepgramSdkModule.createClient as unknown as MockInstance
      mockDeepgramCreateClient.mockReset()

      // Setup transcribeFile mock function
      currentTranscribeFileMockFn = vi.fn()
      mockDeepgramCreateClient.mockImplementation(() => ({
        listen: {
          prerecorded: {
            transcribeFile: currentTranscribeFileMockFn,
          },
        },
      }))

      // Setup test environment variables
      process.env = {
        ...originalEnv,
        DEEPGRAM_API_KEY: 'test_deepgram_key',
      }
    })

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv
    })

    test('should transcribe an audio file successfully', async () => {
      // Arrange
      const mockTranscriptionResult = 'This is a test transcription.'
      const mockResult: MockTranscriptionResult = {
        result: {
          results: {
            channels: [{
              alternatives: [{
                transcript: mockTranscriptionResult,
              }],
            }],
          },
        },
        error: null,
      }
      currentTranscribeFileMockFn.mockResolvedValueOnce(mockResult)

      // Act
      const transcriptText = await transcribeSUT(mockAudioFilePath)

      // Assert
      expect(transcriptText).toBe(mockTranscriptionResult)
      expect(mockFsCreateReadStream).toHaveBeenCalledWith(mockAudioFilePath)
      expect(mockDeepgramCreateClient).toHaveBeenCalledWith('test_deepgram_key')
      expect(currentTranscribeFileMockFn).toHaveBeenCalledWith(
        mockReadStreamObject,
        { model: 'nova-3', smart_format: true, punctuate: true }
      )
    })

    test('should initialize Deepgram client only once for multiple calls', async () => {
      // Arrange
      const mockResult: MockTranscriptionResult = {
        result: {
          results: {
            channels: [{
              alternatives: [{
                transcript: 'abc',
              }],
            }],
          },
        },
        error: null,
      }
      currentTranscribeFileMockFn.mockResolvedValue(mockResult)

      // Act
      await transcribeSUT(mockAudioFilePath)
      await transcribeSUT(mockAudioFilePath)

      // Assert
      expect(mockDeepgramCreateClient).toHaveBeenCalledTimes(1)
    })

    test('should throw an error if Deepgram API (transcribeFile) returns an error', async () => {
      // Arrange
      const deepgramError = new Error('Deepgram API Error')
      const mockResult: MockTranscriptionResult = {
        result: null,
        error: deepgramError,
      }
      currentTranscribeFileMockFn.mockResolvedValueOnce(mockResult)

      // Act & Assert
      await expect(transcribeSUT(mockAudioFilePath)).rejects.toThrow(deepgramError)
    })

    test('should throw an error if DEEPGRAM_API_KEY is missing', async () => {
      // Arrange
      const originalApiKey = process.env.DEEPGRAM_API_KEY
      delete process.env.DEEPGRAM_API_KEY

      // Reset modules to get fresh transcribe function without API key
      vi.resetModules()
      const { transcribe: transcribeVersionWithoutApiKey } = await import('../transcribe.js')

      // Act & Assert
      await expect(transcribeVersionWithoutApiKey(mockAudioFilePath))
        .rejects.toThrow('DEEPGRAM_API_KEY not found.')

      // Cleanup
      if (originalApiKey !== undefined) {
        process.env.DEEPGRAM_API_KEY = originalApiKey
      } else {
        delete process.env.DEEPGRAM_API_KEY
      }
    })

    test('should throw an error if fs.createReadStream fails', async () => {
      // Arrange
      const streamError = new Error('File not found')
      vi.resetModules()
      const { transcribe: transcribeSUTFresh } = await import('../transcribe.js')

      // Setup fresh fs mock that throws error
      await import('fs')
      const localMockFsCreateReadStream = mockFsCreateReadStreamFn
      localMockFsCreateReadStream.mockReset()
      localMockFsCreateReadStream.mockImplementationOnce(() => {
        throw streamError
      })

      // Setup fresh Deepgram mock
      const deepgramSdkModuleFresh = await import('@deepgram/sdk')
      const localMockDeepgramCreateClient = deepgramSdkModuleFresh.createClient as unknown as MockInstance
      const localCurrentTranscribeFileMockFn = vi.fn()
      localMockDeepgramCreateClient.mockImplementation(() => ({
        listen: {
          prerecorded: {
            transcribeFile: localCurrentTranscribeFileMockFn,
          },
        },
      }))

      // Act & Assert
      await expect(transcribeSUTFresh(mockAudioFilePath)).rejects.toThrow(streamError)
    })
  })
}) 