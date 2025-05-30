// Unit tests for packages/server/lib/utils.js

// Import crypto for dynamic signature calculation in getAuthHeaders tests
import crypto from 'crypto';

// Vitest's utilities for mocking
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock for node-fetch (used by utils.js for its fetch calls)
vi.mock('node-fetch', () => ({
    __esModule: true,
    default: vi.fn()
}));

// Mock for ../spotify.js (used by utils.js for getSpotifyAccessToken)
vi.mock('../spotify.js', () => ({
    getSpotifyAccessToken: vi.fn()
}));

// SUT functions and their mocks will be dynamically imported in beforeEach
let getAuthHeaders, getTitleSlug, getFeedUrl, jaccardSimilarity;
let actualMockNodeFetch; // This will hold the vi.fn() from the node-fetch mock
let mockedGetSpotifyAccessToken; // This will hold the vi.fn() from the spotify.js mock

describe('Utility Functions', () => {

    beforeEach(async () => {
        vi.resetModules(); // Reset modules to clear any state and get fresh mocks

        // Dynamically import SUT
        const utilsModule = await import('../utils.js'); // UPDATED PATH
        getAuthHeaders = utilsModule.getAuthHeaders;
        getTitleSlug = utilsModule.getTitleSlug;
        getFeedUrl = utilsModule.getFeedUrl;
        jaccardSimilarity = utilsModule.jaccardSimilarity;

        // Dynamically import mocked node-fetch and get the mock function
        const freshMockedNfModule = await import('node-fetch');
        if (freshMockedNfModule.default && typeof freshMockedNfModule.default.mockReset === 'function') {
            actualMockNodeFetch = freshMockedNfModule.default;
        } else {
            console.error("CRITICAL (utils.test beforeEach): Could not get .default.mockReset from re-imported 'node-fetch'.");
            actualMockNodeFetch = vi.fn(); // Fallback
        }
        actualMockNodeFetch.mockReset();

        // Dynamically import mocked spotify.js and get the mock function
        const freshMockedSpotifyModule = await import('../spotify.js'); // UPDATED PATH
        if (freshMockedSpotifyModule.getSpotifyAccessToken && typeof freshMockedSpotifyModule.getSpotifyAccessToken.mockReset === 'function') {
            mockedGetSpotifyAccessToken = freshMockedSpotifyModule.getSpotifyAccessToken;
        } else {
            console.error("CRITICAL (utils.test beforeEach): Could not get .getSpotifyAccessToken.mockReset from re-imported 'spotify.js'.");
            mockedGetSpotifyAccessToken = vi.fn(); // Fallback
        }
        mockedGetSpotifyAccessToken.mockReset();
    });

    // No afterEach needed for global fetch restoration anymore

    describe('jaccardSimilarity', () => {
        // These tests do not use fetch or spotify mocks, so they should be unaffected by the new beforeEach setup
        test('should return 1 for identical strings', () => {
            expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
        });
        test('should return 0 for completely different strings', () => {
            expect(jaccardSimilarity('hello', 'world')).toBe(0);
        });
        test('should return a value between 0 and 1 for partially similar strings', () => {
            const similarity = jaccardSimilarity('hello javascript', 'hello world');
            expect(similarity).toBeCloseTo(1/3);
        });
        test('should return 1 for empty strings', () => {
            expect(jaccardSimilarity('', '')).toBe(1);
        });
        test('should return 0 if one string is empty', () => {
            expect(jaccardSimilarity('abc', '')).toBe(0);
        });
        test('should be case-sensitive', () => {
            expect(jaccardSimilarity('Hello', 'hello')).toBe(0);
        });
        test('should handle special characters', () => {
            expect(jaccardSimilarity('test!ep@1', 'test!ep@1')).toBe(1);
        });
    });

    describe('getAuthHeaders', () => {
        const originalEnv = process.env;
        beforeEach(() => {
            // Specific beforeEach for getAuthHeaders, runs AFTER the main one
            process.env = {
                ...originalEnv,
                PODCASTINDEX_KEY: 'testkey',
                PODCASTINDEX_SECRET: 'testsecret',
            };
            vi.setSystemTime(new Date(1678886400000)); // 2023-03-15T12:00:00.000Z
        });
        afterEach(() => {
            process.env = originalEnv;
            vi.useRealTimers();
        });

        test('should return correct authentication headers', () => {
            const headers = getAuthHeaders(); // Uses dynamically imported getAuthHeaders
            const expectedTime = '1678886400';
            const expectedSignature = crypto.createHash('sha1').update('testkeytestsecret' + expectedTime).digest('hex');
            expect(headers['X-Auth-Key']).toBe('testkey');
            expect(headers['X-Auth-Date']).toBe(expectedTime);
            expect(headers['Authorization']).toBe(expectedSignature);
        });
        test('should throw an error if PODCASTINDEX_KEY is missing', () => {
            delete process.env.PODCASTINDEX_KEY;
            expect(() => getAuthHeaders()).toThrow('PodcastIndex API Key/Secret is missing'); 
        });
        test('should throw an error if PODCASTINDEX_SECRET is missing', () => {
            delete process.env.PODCASTINDEX_SECRET;
            expect(() => getAuthHeaders()).toThrow('PodcastIndex API Key/Secret is missing');
        });
    });

    describe('getTitleSlug', () => {
        // Top-level beforeEach already resets actualMockNodeFetch and mockedGetSpotifyAccessToken
        test('should return correct slug for a valid Spotify show URL', async () => {
            mockedGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token');
            actualMockNodeFetch.mockResolvedValueOnce({ // This is the mock for fetch used by getTitleSlug
                ok: true,
                json: async () => ({ name: 'My Awesome Show | Podcasts' }),
            });
            const slug = await getTitleSlug('https://open.spotify.com/show/12345ABC?si=xyz');
            expect(mockedGetSpotifyAccessToken).toHaveBeenCalledTimes(1);
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
            expect(actualMockNodeFetch).toHaveBeenCalledWith(
                'https://api.spotify.com/v1/shows/12345ABC', 
                { headers: { Authorization: 'Bearer fake_spotify_token' } }
            );
            expect(slug).toBe('my awesome show');
        });

        test('should handle show names with emojis and extra text', async () => {
            mockedGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token');
            actualMockNodeFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ name: '🎉 My Show Title 😊 | Some Other Text' }),
            });
            const slug = await getTitleSlug('https://open.spotify.com/show/67890DEF?si=abc');
            expect(slug).toBe('my show title');
        });

        test('should throw error if URL is not a Spotify show link', async () => {
            await expect(getTitleSlug('https://example.com/not-spotify')).rejects.toThrow('getTitleSlug: URL is not a Spotify show link');
        });

        test('should throw error if Spotify API call fails', async () => {
            mockedGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token');
            actualMockNodeFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error'
            });
            await expect(getTitleSlug('https://open.spotify.com/show/errorShow')).rejects.toThrow('Failed to fetch show from Spotify API');
        });

        test('should throw error if Spotify API returns no show name', async () => {
            mockedGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token');
            actualMockNodeFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'anIdButNoName' }),
            });
            await expect(getTitleSlug('https://open.spotify.com/show/noNameShow')).rejects.toThrow('No show name returned from Spotify API');
        });
    });

    describe('getFeedUrl', () => {
        const originalEnv = process.env;
        beforeEach(() => {
            // Specific beforeEach for getFeedUrl
            process.env = {
                ...originalEnv,
                PODCASTINDEX_KEY: 'test_podcast_key',
                PODCASTINDEX_SECRET: 'test_podcast_secret',
                USER_AGENT: 'Test User Agent'
            };
            vi.setSystemTime(new Date(1678886400000)); 
        });
        afterEach(() => {
            process.env = originalEnv;
            vi.useRealTimers();
        });

        const testSlug = 'my test podcast';
        const podcastIndexApiUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(testSlug)}`;
        const itunesApiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(testSlug)}&media=podcast&limit=1`;
        
        test('should return feed URL from PodcastIndex if a good match is found', async () => {
            actualMockNodeFetch.mockResolvedValueOnce({ 
                ok: true,
                json: async () => ({ feeds: [{ title: 'my test podcast', url: 'https://podcastindex.com/feed' }] }),
            });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBe('https://podcastindex.com/feed');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
            expect(actualMockNodeFetch).toHaveBeenCalledWith(podcastIndexApiUrl, expect.objectContaining({
                headers: expect.objectContaining({
                    'X-Auth-Key': 'test_podcast_key',
                    'Authorization': expect.any(String)
                })
            })); 
        });

        test('should return first feed URL from PodcastIndex if no specific match has similarity >= 0.8', async () => {
            actualMockNodeFetch.mockResolvedValueOnce({ 
                ok: true,
                json: async () => ({ 
                    feeds: [
                        { title: 'Some Other Show', url: 'https://podcastindex.com/feed1' },
                        { title: 'Yet Another Podcast', url: 'https://podcastindex.com/feed2' }
                    ]
                }),
            });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBe('https://podcastindex.com/feed1');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
        });

        test('should fallback to iTunes if PodcastIndex returns no feeds', async () => {
            actualMockNodeFetch
                .mockResolvedValueOnce({ // PodcastIndex call - no feeds
                    ok: true,
                    json: async () => ({ feeds: [] }), 
                })
                .mockResolvedValueOnce({ // iTunes call - success
                    ok: true,
                    json: async () => ({ results: [{ feedUrl: 'https://itunes.com/feed' }] }),
                });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBe('https://itunes.com/feed');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(2);
            expect(actualMockNodeFetch).toHaveBeenNthCalledWith(1, podcastIndexApiUrl, expect.any(Object));
            expect(actualMockNodeFetch).toHaveBeenNthCalledWith(2, itunesApiUrl);
        });

        test('should throw error from PodcastIndex if it fails and not call iTunes', async () => {
            actualMockNodeFetch
                .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'PI Error' });
            await expect(getFeedUrl(testSlug)).rejects.toThrow('PodcastIndex search failed with status 500');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
        });
        
        test('should return null if PodcastIndex has no feeds and iTunes has no results', async () => {
            actualMockNodeFetch
                .mockResolvedValueOnce({ ok: true, json: async () => ({ feeds: [] }) })
                .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBeNull();
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(2);
        });

        test('should return null if PodcastIndex has no feeds and iTunes API call fails', async () => {
            actualMockNodeFetch
                .mockResolvedValueOnce({ ok: true, json: async () => ({ feeds: [] }) })
                .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'iTunes Error' });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBeNull(); 
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(2);
        });

        test('should handle PodcastIndex returning malformed data (no feeds array) and fallback to iTunes', async () => {
            actualMockNodeFetch
                .mockResolvedValueOnce({ // PodcastIndex call - malformed
                    ok: true,
                    json: async () => ({ message: 'no feeds here' }), 
                })
                .mockResolvedValueOnce({ // iTunes call - success
                    ok: true,
                    json: async () => ({ results: [{ feedUrl: 'https://itunes.com/feed' }] }),
                });
            const feedUrl = await getFeedUrl(testSlug);
            expect(feedUrl).toBe('https://itunes.com/feed');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(2);
        });
    });
}); 