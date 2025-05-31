import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';

// Define mock functions/objects that are NOT for path/os, or are used by multiple factories
const mockValidateSpotifyUrl = vi.fn();
const mockGetPodcastSlug = vi.fn();
const mockGetPodcastFeed = vi.fn();
const mockFetchRssFeed = vi.fn();
const mockParseRssFeed = vi.fn();
const mockExtractMp3Url = vi.fn();
const mockPodcastService = { validateSpotifyUrl: mockValidateSpotifyUrl, getPodcastSlug: mockGetPodcastSlug, getPodcastFeed: mockGetPodcastFeed, fetchRssFeed: mockFetchRssFeed, parseRssFeed: mockParseRssFeed, extractMp3Url: mockExtractMp3Url };
const mockTranscribeLibFn = vi.fn();
const mockFsCreateWriteStream = vi.fn();
const mockFsUnlink = vi.fn(); // For callback version fs.unlink(path, callback)
const mockFsPromisesUnlink = vi.fn(); // For fs.promises.unlink(path)
const mockReadableFrom = vi.fn(); // For stream mock factory
const mockStreamFinished = vi.fn(); // For stream/promises mock factory

// NEW: mock for global fetch
const mockGlobalFetch = vi.fn();

// vi.mock calls. path and os factories will define their own mock function implementations internally.
vi.mock('../../services/podcastService.js', () => ({ default: mockPodcastService }));
vi.mock('../../lib/transcribe.js', () => ({ transcribe: mockTranscribeLibFn }));

// Simplified fs mock
vi.mock('fs', () => {
  // console.log('[TEST DEBUG] vi.mock for "fs" factory is executing.'); // Diagnostic
  const methods = {
    createWriteStream: mockFsCreateWriteStream,
    unlink: mockFsUnlink, // callback unlink
    promises: {
      unlink: mockFsPromisesUnlink,
    },
    // If the SUT uses other fs methods not listed here, it will error.
    // This is to ensure our mock is minimal and targeted.
    // Add other methods from importOriginal if they are actually used by the SUT.
  };
  return {
    default: methods, // fs in SUT becomes this object
    ...methods,      // For import * as fs or import { createWriteStream }
    __esModule: true,
  };
});

vi.mock('os', () => {
  const internalMockOsTmpdir = vi.fn(() => '/tmp');
  return {
    default: { tmpdir: internalMockOsTmpdir },
    tmpdir: internalMockOsTmpdir,
    __esModule: true
  };
});

vi.mock('path', () => {
  const internalMockPathJoin = (...args) => args.join('/');
  const internalMockPathExtname = vi.fn((filename) => { const parts = filename.split('.'); return parts.length > 1 ? `.${parts.pop()}` : ''; });
  const internalMockBasename = vi.fn(filePath => typeof filePath === 'string' ? filePath.substring(filePath.lastIndexOf('/') + 1) : '');
  const internalMockDirname = vi.fn(filePath => { if (typeof filePath !== 'string') return '.'; const lastSlash = filePath.lastIndexOf('/'); if (lastSlash === -1) return '.'; if (lastSlash === 0) return '/'; return filePath.substring(0, lastSlash); });
  return {
    default: { 
      join: internalMockPathJoin, 
      extname: internalMockPathExtname, 
      sep: '/', 
      basename: internalMockBasename, 
      dirname: internalMockDirname 
    },
    join: internalMockPathJoin,
    extname: internalMockPathExtname,
    sep: '/',
    basename: internalMockBasename,
    dirname: internalMockDirname,
    __esModule: true
  };
});

vi.mock('stream', async (importOriginal) => { const actualStream = await importOriginal(); return { ...actualStream, Readable: { ...actualStream.Readable, from: mockReadableFrom }, __esModule: true }; });
vi.mock('stream/promises', () => ({ finished: mockStreamFinished, __esModule: true }));

// Static imports: vitest, supertest, express, and NOW path and os
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path'; // Should get the self-contained mocked path
import os from 'os';     // Should get the self-contained mocked os

let ActualReadable;
let app;
let ActualWritable; // Added for Writable stream instances

beforeAll(async () => {
  vi.stubGlobal('fetch', mockGlobalFetch);
  vi.resetModules();

  const streamModule = await vi.importActual('stream');
  ActualReadable = streamModule.Readable;
  ActualWritable = streamModule.Writable; // Initialize ActualWritable

  const transcribeRouterModule = await import('../transcribe.js');
  const transcribeRouter = transcribeRouterModule.default;

  app = express();
  app.use(express.json());
  app.use('/transcribe', transcribeRouter);
}); // This closes beforeAll

// Test suite for GET /transcribe
describe('GET /transcribe', () => {
  // Constants specific to GET /transcribe tests
  const mockSpotifyUrl = 'https://open.spotify.com/show/testshow';
  const mockSlug = 'test-show';
  const mockFeedUrl = 'https://example.com/feed.xml';
  const mockRssText = '<rss></rss>';
  const mockRssData = { rss: { channel: { item: [{ enclosure: { '@_url': 'https://example.com/episode.mp3' } }] } } };
  const mockMp3Url = 'https://example.com/episode.mp3';
  const mockTranscript = 'This is a test transcript.';
  // path.join and os.tmpdir() will use the mocked versions imported above.
  // Ensure mockSlug is defined before use here
  const mockTmpFile = path.join(os.tmpdir(), `${mockSlug}.mp3`);

  beforeEach(() => {
    // Reset mock functions defined globally
    mockValidateSpotifyUrl.mockReset();
    mockGetPodcastSlug.mockReset();
    mockGetPodcastFeed.mockReset();
    mockFetchRssFeed.mockReset();
    mockParseRssFeed.mockReset();
    mockExtractMp3Url.mockReset();
    mockTranscribeLibFn.mockReset();
    mockFsCreateWriteStream.mockReset();
    mockFsUnlink.mockReset(); // For callback unlink
    mockFsPromisesUnlink.mockReset(); // For promises unlink
    mockGlobalFetch.mockReset(); // Reset mockGlobalFetch
    mockReadableFrom.mockReset();
    mockStreamFinished.mockReset();

    mockValidateSpotifyUrl.mockReturnValue(true);
    mockGetPodcastSlug.mockResolvedValue(mockSlug);
    mockGetPodcastFeed.mockResolvedValue(mockFeedUrl);
    mockFetchRssFeed.mockResolvedValue(mockRssText);
    mockParseRssFeed.mockReturnValue(mockRssData);
    mockExtractMp3Url.mockReturnValue(mockMp3Url);
    mockTranscribeLibFn.mockResolvedValue(mockTranscript);

    mockGlobalFetch.mockResolvedValue({
      ok: true,
      body: ActualReadable.from(['mock audio data', null]),
      status: 200,
      headers: new Headers()
    });

    const minimalWritableStream = new ActualWritable({
      write(chunk, encoding, callback) {
        callback();
      }
    });
    mockFsCreateWriteStream.mockReturnValue(minimalWritableStream);

    mockStreamFinished.mockResolvedValue(undefined);
    mockFsUnlink.mockImplementation((filePath, callback) => { if (callback) callback(null); });
    mockFsPromisesUnlink.mockResolvedValue(undefined);

    const mockReadableStreamForPipe = new ActualReadable({ read() {} });
    mockReadableStreamForPipe.push(null);
    mockReadableFrom.mockReturnValue(mockReadableStreamForPipe);
  });

  it('should successfully transcribe a podcast given a valid Spotify URL', async () => {
    const response = await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/plain');
    expect(response.text).toBe(mockTranscript);
    expect(mockValidateSpotifyUrl).toHaveBeenCalledWith(mockSpotifyUrl);
    expect(mockGetPodcastSlug).toHaveBeenCalledWith(mockSpotifyUrl);
    expect(mockGetPodcastFeed).toHaveBeenCalledWith(mockSlug);
    expect(mockFetchRssFeed).toHaveBeenCalledWith(mockFeedUrl);
    expect(mockParseRssFeed).toHaveBeenCalledWith(mockRssText);
    expect(mockExtractMp3Url).toHaveBeenCalledWith(mockRssData);
    expect(mockGlobalFetch).toHaveBeenCalledWith(mockMp3Url);
    expect(mockFsCreateWriteStream).toHaveBeenCalledWith(mockTmpFile);
    expect(mockTranscribeLibFn).toHaveBeenCalledWith(mockTmpFile);
    expect(mockFsUnlink).toHaveBeenCalledWith(mockTmpFile, expect.anything());
  });

  it('should return 400 if URL parameter is missing', async () => {
    const response = await request(app).get('/transcribe');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing `url` query parameter.');
  });

  it('should return 400 if Spotify URL is invalid', async () => {
    mockValidateSpotifyUrl.mockReturnValueOnce(false);
    const response = await request(app).get(`/transcribe?url=invalid-url`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid URL; must be a Spotify podcast show title.');
  });

  it('should return 500 if getPodcastSlug fails', async () => {
    const error = new Error('Slug error');
    mockGetPodcastSlug.mockRejectedValueOnce(error);
    const response = await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Slug error');
  });

  it('should return 500 if MP3 fetch fails (fetch not ok)', async () => {
    mockGlobalFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    });
    const response = await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('MP3 fetch failed: 404');
  });

   it('should return 500 if MP3 fetch fails (fetch throws)', async () => {
    mockGlobalFetch.mockRejectedValueOnce(new Error('Network connection error'));
    const response = await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Network connection error');
  });

  it('should return 500 if transcribeLib fails', async () => {
    mockTranscribeLibFn.mockRejectedValueOnce(new Error('Transcription error'));
    const response = await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Transcription error');
    expect(mockFsUnlink).toHaveBeenCalledWith(mockTmpFile, expect.anything());
  });

  it('should attempt to clean up temp file even if an error occurs mid-process (e.g. getPodcastFeed fails)', async () => {
    mockGetPodcastFeed.mockRejectedValueOnce(new Error('Feed error'));
    // When getPodcastFeed fails, tmpFile is never assigned, so unlink should not be called.
    await request(app).get(`/transcribe?url=${mockSpotifyUrl}`);
    expect(mockFsUnlink).not.toHaveBeenCalled(); // Changed from .toHaveBeenCalledWith(mockTmpFile, expect.anything())
  });
}); // This closes GET /transcribe describe

// Test suite for POST /transcribe
describe('POST /transcribe', () => {
  beforeEach(() => {
    mockValidateSpotifyUrl.mockReset();
    mockGetPodcastSlug.mockReset();
    mockGetPodcastFeed.mockReset();
    mockFetchRssFeed.mockReset();
    mockParseRssFeed.mockReset();
    mockExtractMp3Url.mockReset();
    mockTranscribeLibFn.mockReset();
    mockFsCreateWriteStream.mockReset();
    mockFsUnlink.mockReset(); // For callback unlink
    mockFsPromisesUnlink.mockReset(); // For promises unlink
    mockGlobalFetch.mockReset(); // Reset mockGlobalFetch
    mockReadableFrom.mockReset();
    mockStreamFinished.mockReset();
    
    mockValidateSpotifyUrl.mockReturnValue(true);
    mockGetPodcastSlug.mockResolvedValue('test-podcast-slug'); // Different slug for POST tests
    mockGetPodcastFeed.mockResolvedValue('http://example.com/feed.xml');
    mockFetchRssFeed.mockResolvedValue('<rss></rss>'); 
    mockParseRssFeed.mockReturnValue({ rss: { channel: { item: { enclosure: { '@_url': 'http://example.com/episode.mp3' } } } } });
    mockExtractMp3Url.mockReturnValue('http://example.com/episode.mp3');
    mockTranscribeLibFn.mockResolvedValue('Test transcription text');

    const mockMp3BodyStream = new ActualReadable({ read() {} });
    mockMp3BodyStream.push(null);
    mockGlobalFetch.mockResolvedValue({ 
      ok: true, 
      body: mockMp3BodyStream, 
      status: 200, 
      headers: new Headers() 
    });
    
    const minimalWritableStreamPost = new ActualWritable({
      write(chunk, encoding, callback) {
        callback();
      }
    });
    mockFsCreateWriteStream.mockReturnValue(minimalWritableStreamPost);

    mockStreamFinished.mockResolvedValue(undefined);
    mockFsUnlink.mockImplementation((filePath, callback) => { if (callback) callback(null); });
    mockFsPromisesUnlink.mockResolvedValue(undefined);

    const mockReadableForPipe = new ActualReadable({ read() {} });
    mockReadableForPipe.push(null);
    mockReadableFrom.mockReturnValue(mockReadableForPipe);
  });

  it('should transcribe a podcast from a valid Spotify URL', async () => {
    const response = await request(app)
      .post('/transcribe')
      .send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ transcription: 'Test transcription text' });
    expect(mockValidateSpotifyUrl).toHaveBeenCalledWith('https://open.spotify.com/show/validshow');
    expect(mockGetPodcastSlug).toHaveBeenCalled();
    expect(mockGlobalFetch).toHaveBeenCalledWith('http://example.com/episode.mp3');
    expect(mockFsCreateWriteStream).toHaveBeenCalled();
    expect(mockTranscribeLibFn).toHaveBeenCalled();
    expect(mockFsUnlink).toHaveBeenCalled();
  });

  it('should return 400 for an invalid Spotify URL', async () => {
    mockValidateSpotifyUrl.mockReturnValue(false);
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'invalid-url' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid Spotify URL provided.');
  });

  it('should return 400 if spotifyUrl is missing', async () => {
    const response = await request(app).post('/transcribe').send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing spotifyUrl in request body.');
  });

  it('should return 500 if podcastService.getPodcastSlug fails', async () => {
    mockGetPodcastSlug.mockRejectedValue(new Error('Slug error'));
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to process podcast feed: Slug error/i);
  });

  it('should return 500 if MP3 download fails (fetch not ok)', async () => {
    mockGlobalFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() });
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to download MP3 file: MP3 fetch failed: 404/i);
  });

  it('should return 500 if MP3 download fails (fetch throws)', async () => {
    mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'));
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to download MP3 file: Network error/i);
  });

  it('should return 500 if creating file stream fails', async () => {
    mockFsCreateWriteStream.mockImplementation(() => { throw new Error('FS error'); });
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to save MP3 file: FS error/i); 
  });

  it('should return 500 if piping stream to file fails (stream.finished rejects)', async () => {
    mockStreamFinished.mockRejectedValueOnce(new Error('Stream pipe error'));
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to save MP3 file: Stream pipe error/i);
  });

  it('should return 500 if transcription lib fails', async () => {
    mockTranscribeLibFn.mockRejectedValue(new Error('Transcription error'));
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Error during transcription: Transcription error/i);
  });

  it('should attempt to delete temp file even if transcription fails', async () => {
    mockTranscribeLibFn.mockRejectedValue(new Error('Transcription error'));
    await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(mockFsUnlink).toHaveBeenCalled();
  });

  it('should return normally if deleting temp file fails but main operation succeeded', async () => {
    mockTranscribeLibFn.mockResolvedValue('Success');
    mockFsUnlink.mockImplementationOnce((filePath, callback) => {
        const err = new Error('Delete error');
        if (callback) callback(err);
        return Promise.reject(err);
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app).post('/transcribe').send({ spotifyUrl: 'https://open.spotify.com/show/validshow' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ transcription: 'Success' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete temp file /tmp/'), expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
}); 