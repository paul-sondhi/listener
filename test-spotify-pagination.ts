#!/usr/bin/env tsx

/**
 * Test script to check Spotify API pagination for a specific user
 * This will show us exactly what responses we get from Spotify and whether pagination is working correctly
 */

import { getSupabaseAdmin } from './packages/server/lib/db/supabase';
import { getValidTokens } from './packages/server/services/authService';

// Configuration
const TEST_USER_ID = process.env.TEST_USER_ID || 'your-user-id-here';

interface SpotifyShow {
    id: string;
    name: string;
    description: string;
    images: Array<{ url: string }>;
}

interface SpotifyUserShows {
    items: Array<{ show: SpotifyShow }>;
    next: string | null;
    total: number;
    limit: number;
    offset: number;
}

/**
 * Fetch user's Spotify subscriptions with detailed logging
 */
async function testSpotifyPagination(userId: string): Promise<void> {
    console.log(`\n🔍 Testing Spotify pagination for user: ${userId}`);
    console.log('=' .repeat(60));

    try {
        // 1. Get user's Spotify tokens
        console.log('\n📋 Step 1: Getting user tokens...');
        const tokenResult = await getValidTokens(userId);
        
        if (!tokenResult.success) {
            console.error('❌ Failed to get tokens:', tokenResult.error);
            return;
        }

        const spotifyAccessToken = tokenResult.tokens.access_token;
        console.log('✅ Got access token successfully');

        // 2. Fetch all shows with detailed pagination logging
        console.log('\n📋 Step 2: Fetching shows from Spotify API...');
        const shows: Array<{ show: SpotifyShow }> = [];
        let nextUrl: string | null = 'https://api.spotify.com/v1/me/shows?limit=50';
        let pageCount = 0;
        let totalShows = 0;

        while (nextUrl) {
            pageCount++;
            console.log(`\n📄 Page ${pageCount}: ${nextUrl}`);
            
            try {
                const response = await fetch(nextUrl, {
                    headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                });

                if (!response.ok) {
                    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json() as SpotifyUserShows;
                
                // Log detailed response information
                console.log(`   📊 Response details:`);
                console.log(`      - Items in this page: ${data.items?.length || 0}`);
                console.log(`      - Total shows (from API): ${data.total || 'unknown'}`);
                console.log(`      - Limit: ${data.limit || 'unknown'}`);
                console.log(`      - Offset: ${data.offset || 'unknown'}`);
                console.log(`      - Next URL: ${data.next ? 'Yes' : 'No'}`);
                
                if (data.items && Array.isArray(data.items)) {
                    shows.push(...data.items);
                    totalShows = shows.length;
                    console.log(`      - Cumulative total: ${totalShows}`);
                    
                    // Show first few show names for verification
                    if (data.items.length > 0) {
                        console.log(`      - Sample shows in this page:`);
                        data.items.slice(0, 3).forEach((item, index) => {
                            console.log(`        ${index + 1}. ${item.show.name} (ID: ${item.show.id})`);
                        });
                        if (data.items.length > 3) {
                            console.log(`        ... and ${data.items.length - 3} more`);
                        }
                    }
                }

                nextUrl = data.next || null;
                
                if (nextUrl) {
                    console.log(`   ⏭️  More pages available, continuing...`);
                } else {
                    console.log(`   ✅ No more pages, pagination complete`);
                }

            } catch (error) {
                console.error(`❌ Error fetching page ${pageCount}:`, error);
                throw error;
            }
        }

        // 3. Summary
        console.log('\n📋 Step 3: Summary');
        console.log('=' .repeat(60));
        console.log(`📊 Total pages fetched: ${pageCount}`);
        console.log(`📊 Total shows found: ${totalShows}`);
        console.log(`📊 Average shows per page: ${totalShows / pageCount}`);
        
        if (totalShows === 100) {
            console.log(`\n⚠️  NOTE: Total is exactly 100 shows`);
            console.log(`   - This could be a coincidence`);
            console.log(`   - Or it could indicate a limit at 2 pages (50 + 50 = 100)`);
            console.log(`   - Check if pageCount = 2 to confirm`);
        }

        // 4. Show all show names for verification
        console.log('\n📋 Step 4: All shows found');
        console.log('=' .repeat(60));
        shows.forEach((item, index) => {
            console.log(`${index + 1}. ${item.show.name} (ID: ${item.show.id})`);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
    if (!TEST_USER_ID || TEST_USER_ID === 'your-user-id-here') {
        console.error('❌ Please set TEST_USER_ID environment variable');
        console.error('   Example: TEST_USER_ID=your-actual-user-id tsx test-spotify-pagination.ts');
        process.exit(1);
    }

    await testSpotifyPagination(TEST_USER_ID);
}

// Run the test
main().catch(console.error); 