// Unit tests for packages/server/lib/transcribe.js

// Vitest's utilities for mocking
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Hoisted mock for 'fs'
const mockFsCreateReadStreamFn = vi.fn(); 
vi.mock('fs', () => ({
    __esModule: true, 
    createReadStream: mockFsCreateReadStreamFn, 
    default: { 
        createReadStream: mockFsCreateReadStreamFn,
    }
}));

// Hoisted mock for '@deepgram/sdk'
vi.mock('@deepgram/sdk', () => ({
    createClient: vi.fn(() => ({
        listen: {
            prerecorded: {
                transcribeFile: vi.fn(), 
            },
        },
    })),
}));

// SUT and mocks will be imported dynamically
let transcribeSUT;
let mockFsCreateReadStream; 
let mockDeepgramCreateClient;
let currentTranscribeFileMockFn; 

describe('Transcription Service', () => {
    describe('transcribe', () => {
        const originalEnv = process.env;
        const mockAudioFilePath = '/test/audio.mp3';
        const mockReadStreamObject = { type: 'mockReadStream' }; 

        beforeEach(async () => {
            vi.resetModules(); 

            const transcribeModule = await import('../transcribe.js'); // UPDATED PATH
            transcribeSUT = transcribeModule.transcribe;

            await import('fs'); 
            mockFsCreateReadStream = mockFsCreateReadStreamFn; 
            mockFsCreateReadStream.mockReset(); 
            mockFsCreateReadStream.mockReturnValue(mockReadStreamObject); 

            const deepgramSdkModule = await import('@deepgram/sdk');
            mockDeepgramCreateClient = deepgramSdkModule.createClient;
            mockDeepgramCreateClient.mockReset(); 

            currentTranscribeFileMockFn = vi.fn(); 
            mockDeepgramCreateClient.mockImplementation(() => ({
                listen: {
                    prerecorded: {
                        transcribeFile: currentTranscribeFileMockFn,
                    },
                },
            }));
            
            process.env = {
                ...originalEnv,
                DEEPGRAM_API_KEY: 'test_deepgram_key',
            };
        });

        afterEach(() => {
            process.env = originalEnv; 
        });

        test('should transcribe an audio file successfully', async () => {
            const mockTranscriptionResult = 'This is a test transcription.';
            currentTranscribeFileMockFn.mockResolvedValueOnce({
                result: { results: { channels: [{ alternatives: [{ transcript: mockTranscriptionResult }] }] } },
                error: null,
            });

            const transcriptText = await transcribeSUT(mockAudioFilePath);

            expect(transcriptText).toBe(mockTranscriptionResult);
            expect(mockFsCreateReadStream).toHaveBeenCalledWith(mockAudioFilePath);
            expect(mockDeepgramCreateClient).toHaveBeenCalledWith('test_deepgram_key');
            expect(currentTranscribeFileMockFn).toHaveBeenCalledWith(
                mockReadStreamObject, 
                { model: 'nova-3', smart_format: true, punctuate: true }
            );
        });

        test('should initialize Deepgram client only once for multiple calls', async () => {
            currentTranscribeFileMockFn.mockResolvedValue({ 
                result: { results: { channels: [{ alternatives: [{ transcript: 'abc' }] }] } }, 
                error: null 
            });
            await transcribeSUT(mockAudioFilePath); 
            await transcribeSUT(mockAudioFilePath); 
            expect(mockDeepgramCreateClient).toHaveBeenCalledTimes(1);
        });
        
        test('should throw an error if Deepgram API (transcribeFile) returns an error', async () => {
            const deepgramError = new Error('Deepgram API Error');
            currentTranscribeFileMockFn.mockResolvedValueOnce({
                result: null,
                error: deepgramError,
            });
            await expect(transcribeSUT(mockAudioFilePath)).rejects.toThrow(deepgramError);
        });

        test('should throw an error if DEEPGRAM_API_KEY is missing', async () => {
            const originalApiKey = process.env.DEEPGRAM_API_KEY;
            delete process.env.DEEPGRAM_API_KEY;
            
            vi.resetModules(); 
            const { transcribe: transcribeVersionWithoutApiKey } = await import('../transcribe.js'); // UPDATED PATH

            await expect(transcribeVersionWithoutApiKey(mockAudioFilePath))
                .rejects.toThrow('DEEPGRAM_API_KEY not found.');
            
            if (originalApiKey !== undefined) {
                process.env.DEEPGRAM_API_KEY = originalApiKey;
            } else {
                delete process.env.DEEPGRAM_API_KEY; 
            }
        });
        
        test('should throw an error if fs.createReadStream fails', async () => {
            const streamError = new Error('File not found');
            vi.resetModules();
            const { transcribe: transcribeSUTFresh } = await import('../transcribe.js'); // UPDATED PATH
            
            await import('fs'); 
            const localMockFsCreateReadStream = mockFsCreateReadStreamFn; 
            localMockFsCreateReadStream.mockReset(); 
            localMockFsCreateReadStream.mockImplementationOnce(() => { throw streamError; });

            const deepgramSdkModuleFresh = await import('@deepgram/sdk');
            const localMockDeepgramCreateClient = deepgramSdkModuleFresh.createClient;
            const localCurrentTranscribeFileMockFn = vi.fn(); 
            localMockDeepgramCreateClient.mockImplementation(() => ({
                listen: {
                    prerecorded: {
                        transcribeFile: localCurrentTranscribeFileMockFn,
                    },
                },
            }));

            await expect(transcribeSUTFresh(mockAudioFilePath)).rejects.toThrow(streamError);
        });
    });
}); 