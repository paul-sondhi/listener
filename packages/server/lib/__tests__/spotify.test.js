import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock for node-fetch
vi.mock('node-fetch', () => ({
    __esModule: true, 
    default: vi.fn()
}));

// Mock for querystring
vi.mock('querystring', () => {
    const internalMockStringify = vi.fn();
    return {
        stringify: internalMockStringify,
        default: { stringify: internalMockStringify },
    };
});

// SUT and mocks will be imported dynamically in beforeEach
let getSpotifyAccessToken;
let actualMockNodeFetch;
let qsStringifyMock;

describe('Spotify Utilities', () => {
    describe('getSpotifyAccessToken', () => {
        const originalEnv = process.env;

        beforeEach(async () => {
            vi.resetModules();

            // Dynamically import SUT
            const spotifyModule = await import('../spotify.js'); // UPDATED PATH
            getSpotifyAccessToken = spotifyModule.getSpotifyAccessToken;

            // Dynamically import mocked node-fetch and get the mock function
            const freshMockedNfModule = await import('node-fetch');
            if (freshMockedNfModule.default && typeof freshMockedNfModule.default.mockReset === 'function') {
                actualMockNodeFetch = freshMockedNfModule.default;
            } else {
                console.error("CRITICAL (beforeEach): Could not get .default.mockReset from re-imported 'node-fetch'. Module:", freshMockedNfModule);
                actualMockNodeFetch = vi.fn(); // Fallback
            }
            actualMockNodeFetch.mockReset();

            // Dynamically import mocked querystring and get the stringify mock function
            const freshQuerystringModule = await import('querystring');
            if (freshQuerystringModule.stringify && typeof freshQuerystringModule.stringify.mockReset === 'function') {
                qsStringifyMock = freshQuerystringModule.stringify;
            } else if (freshQuerystringModule.default && freshQuerystringModule.default.stringify && typeof freshQuerystringModule.default.stringify.mockReset === 'function') {
                qsStringifyMock = freshQuerystringModule.default.stringify;
            } else {
                console.error("CRITICAL (beforeEach): Could not get stringify mock from re-imported 'querystring'. Module:", freshQuerystringModule);
                qsStringifyMock = vi.fn(); 
            }
            qsStringifyMock.mockReset();
            qsStringifyMock.mockReturnValue('grant_type=client_credentials');
            
            vi.useFakeTimers();
            process.env = {
                ...originalEnv,
                SPOTIFY_CLIENT_ID: 'test_client_id',
                SPOTIFY_CLIENT_SECRET: 'test_client_secret',
            };
        });

        afterEach(() => {
            process.env = originalEnv;
            vi.useRealTimers();
        });

        // Tests using dynamically imported getSpotifyAccessToken and correctly referenced mocks
        test('should fetch a new token if none is cached', async () => {
            vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'));
            const mockTokenResponse = { access_token: 'new_fake_token', expires_in: 3600 };
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => mockTokenResponse });
            const token = await getSpotifyAccessToken();
            expect(token).toBe('new_fake_token');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
            expect(actualMockNodeFetch).toHaveBeenCalledWith('https://accounts.spotify.com/api/token', expect.any(Object));
            expect(qsStringifyMock).toHaveBeenCalledWith({ grant_type: 'client_credentials' });
        });

        test('should return a cached token if it is still valid', async () => {
            vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'));
            const initialTokenResponse = { access_token: 'cached_token', expires_in: 3600 };
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => initialTokenResponse });
            await getSpotifyAccessToken(); // Call 1: Caches 'cached_token'
            actualMockNodeFetch.mockClear(); 
            qsStringifyMock.mockClear();
            vi.setSystemTime(new Date('2023-01-01T10:30:00.000Z'));
            const token = await getSpotifyAccessToken(); // Call 2: Should use cached 'cached_token'
            expect(token).toBe('cached_token');
            expect(actualMockNodeFetch).not.toHaveBeenCalled();
            expect(qsStringifyMock).not.toHaveBeenCalled();
        });

        test('should fetch a new token if cached token is expired', async () => {
            vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'));
            const initialTokenResponse = { access_token: 'old_token', expires_in: 3600 };
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => initialTokenResponse });
            await getSpotifyAccessToken(); // Call 1: Caches 'old_token'
            actualMockNodeFetch.mockClear();
            qsStringifyMock.mockClear();
            qsStringifyMock.mockReturnValue('grant_type=client_credentials'); 
            vi.setSystemTime(new Date('2023-01-01T11:00:00.000Z')); // Token expires
            const newTokenResponse = { access_token: 'refreshed_token', expires_in: 3600 };
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => newTokenResponse });
            const token = await getSpotifyAccessToken(); // Call 2: Should fetch 'refreshed_token'
            expect(token).toBe('refreshed_token');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1); 
            expect(qsStringifyMock).toHaveBeenCalledWith({ grant_type: 'client_credentials' });
        });

        test('should throw an error if SPOTIFY_CLIENT_ID is missing', async () => {
            delete process.env.SPOTIFY_CLIENT_ID;
            await expect(getSpotifyAccessToken()).rejects.toThrow(); 
        });

        test('should throw an error if SPOTIFY_CLIENT_SECRET is missing', async () => {
            delete process.env.SPOTIFY_CLIENT_SECRET;
            await expect(getSpotifyAccessToken()).rejects.toThrow();
        });

        test('should throw an error if fetching token fails', async () => {
            vi.setSystemTime(new Date()); 
            actualMockNodeFetch.mockResolvedValueOnce({ ok: false, status: 500 });
            await expect(getSpotifyAccessToken()).rejects.toThrow('Failed to get Spotify access token');
        });

        test('token expiry calculation should refresh 1 minute early', async () => {
            const currentTime = new Date('2023-01-01T12:00:00.000Z').getTime();
            vi.setSystemTime(currentTime);
            const expiresInSeconds = 300; 
            const tokenResponse = { access_token: 'token_for_expiry_test', expires_in: expiresInSeconds };
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => tokenResponse });
            await getSpotifyAccessToken(); // Call 1: Caches
            actualMockNodeFetch.mockClear();
            qsStringifyMock.mockClear();
            const timeBeforeEarlyRefresh = currentTime + (expiresInSeconds * 1000) - 60000 - 1000; 
            vi.setSystemTime(new Date(timeBeforeEarlyRefresh));
            let token = await getSpotifyAccessToken(); // Call 2: Should use cache
            expect(token).toBe('token_for_expiry_test');
            expect(actualMockNodeFetch).not.toHaveBeenCalled();
            qsStringifyMock.mockClear();
            qsStringifyMock.mockReturnValue('grant_type=client_credentials');
            const timeAtEarlyRefresh = currentTime + (expiresInSeconds * 1000) - 60000 + 1000; 
            vi.setSystemTime(new Date(timeAtEarlyRefresh));
            const newTokenResponse = { access_token: 'new_token_after_early_refresh', expires_in: 3600 }; 
            actualMockNodeFetch.mockResolvedValueOnce({ ok: true, json: async () => newTokenResponse });
            token = await getSpotifyAccessToken(); // Call 3: Should refresh
            expect(token).toBe('new_token_after_early_refresh');
            expect(actualMockNodeFetch).toHaveBeenCalledTimes(1);
            expect(qsStringifyMock).toHaveBeenCalledTimes(1);
        });
    });
}); 