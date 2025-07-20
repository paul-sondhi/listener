import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Set up required environment variables for testing
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-testing';

// --- Mock Supabase client and operations ---
let mockSupabaseAuthGetUser = vi.fn();
let mockSupabaseFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: { getUser: mockSupabaseAuthGetUser },
        from: mockSupabaseFrom,
    })),
}));

// --- Mock encrypted token helpers ---
vi.mock('../../lib/encryptedTokenHelpers', () => ({
    getUserSecret: vi.fn()
}));

// --- Mock utils ---
vi.mock('../../lib/utils.js', () => ({
    getTitleSlug: vi.fn().mockResolvedValue({
        originalName: 'New Show Title From Spotify',
        slug: 'new-show-title-from-spotify',
    }),
    getFeedUrl: vi.fn().mockResolvedValue('https://example.com/feed.rss'),
}));

// --- Mock audiobook filter ---
vi.mock('../../lib/audiobookFilter.js', () => ({
    shouldSkipAudiobook: vi.fn().mockReturnValue(false),
    getAudiobookSkipListCount: vi.fn().mockReturnValue(0),
}));

// --- Mock global fetch ---
let mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are set up
import syncShowsRouter from '../syncShows';
import * as encryptedTokenHelpers from '../../lib/encryptedTokenHelpers.js';

describe('syncShows - Title Preservation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset auth mock
        mockSupabaseAuthGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-123' } },
            error: null,
        });
        
        // Setup encrypted token helper
        vi.mocked(encryptedTokenHelpers.getUserSecret).mockResolvedValue({
            success: true,
            data: {
                access_token: 'test_spotify_token',
                refresh_token: 'test_refresh_token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'Bearer',
                scope: 'user-read-email user-library-read'
            },
            elapsed_ms: 100
        });
    });
    
    it('should preserve existing manually cleaned title when new user subscribes to existing show', async () => {
        // Track what data is being upserted
        let upsertedShowData: any = null;
        
        // Setup Supabase mocks
        mockSupabaseFrom.mockImplementation((tableName: string) => {
            if (tableName === 'podcast_shows') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'show-uuid-123',
                                    spotify_url: 'https://open.spotify.com/show/existing_show_123',
                                    title: 'Cleaned Short Title', // Manually cleaned title to preserve
                                    rss_url: 'https://example.com/feed.rss',
                                },
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockImplementation((data: any) => {
                        upsertedShowData = data[0];
                        return {
                            select: vi.fn().mockResolvedValue({
                                data: [{ id: 'show-uuid-123' }],
                                error: null,
                            }),
                        };
                    }),
                };
            }
            
            if (tableName === 'user_podcast_subscriptions') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue({
                                data: [], // New user, no existing subscriptions
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockResolvedValue({ error: null }),
                    update: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ error: null })
                    })
                };
            }
            
            // Default for other tables
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };
        });
        
        // Mock Spotify API response
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                items: [{
                    show: {
                        id: 'existing_show_123',
                        name: 'Very Long Show Title That Would Normally Be Overwritten From Spotify',
                        description: 'Show description',
                        images: [{ url: 'https://example.com/image.jpg' }],
                    },
                }],
                next: null,
            }),
        });
        
        // Setup Express app
        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use('/sync-spotify-shows', syncShowsRouter);
        
        // Make the request
        const response = await request(app)
            .post('/sync-spotify-shows')
            .set('Cookie', 'sb-access-token=test-token')
            .send();
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        // Verify that the upserted data does NOT include the title field
        // This means the existing title will be preserved
        expect(upsertedShowData).toBeDefined();
        expect(upsertedShowData.spotify_url).toBe('https://open.spotify.com/show/existing_show_123');
        expect(upsertedShowData.title).toBeUndefined(); // Title should not be included in upsert
        expect(upsertedShowData.last_updated).toBeDefined();
    });
    
    it('should update title for new shows that dont exist yet', async () => {
        // Track what data is being upserted
        let upsertedShowData: any = null;
        
        // Setup Supabase mocks
        mockSupabaseFrom.mockImplementation((tableName: string) => {
            if (tableName === 'podcast_shows') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: null, // Show doesn't exist
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockImplementation((data: any) => {
                        upsertedShowData = data[0];
                        return {
                            select: vi.fn().mockResolvedValue({
                                data: [{ id: 'new-show-uuid-456' }],
                                error: null,
                            }),
                        };
                    }),
                };
            }
            
            if (tableName === 'user_podcast_subscriptions') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue({
                                data: [], // New user, no existing subscriptions
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockResolvedValue({ error: null }),
                    update: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ error: null })
                    })
                };
            }
            
            // Default for other tables
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };
        });
        
        // Mock Spotify API response
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                items: [{
                    show: {
                        id: 'new_show_456',
                        name: 'Brand New Show From Spotify',
                        description: 'New show description',
                        images: [{ url: 'https://example.com/new-image.jpg' }],
                    },
                }],
                next: null,
            }),
        });
        
        // Setup Express app
        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use('/sync-spotify-shows', syncShowsRouter);
        
        // Make the request
        const response = await request(app)
            .post('/sync-spotify-shows')
            .set('Cookie', 'sb-access-token=test-token')
            .send();
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        // Verify that the upserted data DOES include the title field for new shows
        expect(upsertedShowData).toBeDefined();
        expect(upsertedShowData.spotify_url).toBe('https://open.spotify.com/show/new_show_456');
        expect(upsertedShowData.title).toBe('Brand New Show From Spotify'); // Title should be set
        expect(upsertedShowData.last_updated).toBeDefined();
    });
    
    it('should update title for shows with placeholder titles', async () => {
        // Track what data is being upserted
        let upsertedShowData: any = null;
        
        // Setup Supabase mocks
        mockSupabaseFrom.mockImplementation((tableName: string) => {
            if (tableName === 'podcast_shows') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'show-uuid-789',
                                    spotify_url: 'https://open.spotify.com/show/placeholder_show_789',
                                    title: 'Show placeholder_show_789', // Placeholder title that should be updated
                                    rss_url: 'https://open.spotify.com/show/placeholder_show_789',
                                },
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockImplementation((data: any) => {
                        upsertedShowData = data[0];
                        return {
                            select: vi.fn().mockResolvedValue({
                                data: [{ id: 'show-uuid-789' }],
                                error: null,
                            }),
                        };
                    }),
                };
            }
            
            if (tableName === 'user_podcast_subscriptions') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue({
                                data: [], // New user, no existing subscriptions
                                error: null,
                            })
                        })
                    }),
                    upsert: vi.fn().mockResolvedValue({ error: null }),
                    update: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ error: null })
                    })
                };
            }
            
            // Default for other tables
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };
        });
        
        // Mock Spotify API response
        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                items: [{
                    show: {
                        id: 'placeholder_show_789',
                        name: 'Actual Show Name From Spotify',
                        description: 'Show description',
                        images: [{ url: 'https://example.com/image.jpg' }],
                    },
                }],
                next: null,
            }),
        });
        
        // Setup Express app
        const app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use('/sync-spotify-shows', syncShowsRouter);
        
        // Make the request
        const response = await request(app)
            .post('/sync-spotify-shows')
            .set('Cookie', 'sb-access-token=test-token')
            .send();
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        // Verify that the upserted data includes the title field to update placeholder
        expect(upsertedShowData).toBeDefined();
        expect(upsertedShowData.spotify_url).toBe('https://open.spotify.com/show/placeholder_show_789');
        expect(upsertedShowData.title).toBe('Actual Show Name From Spotify'); // Title should be updated
        expect(upsertedShowData.last_updated).toBeDefined();
    });
});