#!/usr/bin/env tsx

/**
 * Simple test script to check Spotify API pagination
 * This version takes the access token directly for easier testing
 */

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
async function testSpotifyPaginationSimple(accessToken: string): Promise<void> {
    console.log(`\n🔍 Testing Spotify pagination with provided access token`);
    console.log('=' .repeat(60));

    try {
        // Fetch all shows with detailed pagination logging
        console.log('\n📋 Fetching shows from Spotify API...');
        const shows: Array<{ show: SpotifyShow }> = [];
        let nextUrl: string | null = 'https://api.spotify.com/v1/me/shows?limit=50';
        let pageCount = 0;
        let totalShows = 0;

        while (nextUrl) {
            pageCount++;
            console.log(`\n📄 Page ${pageCount}: ${nextUrl}`);
            
            try {
                const response = await fetch(nextUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
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

        // Summary
        console.log('\n📋 Summary');
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

        // Show all show names for verification
        console.log('\n📋 All shows found');
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
    const accessToken = process.env.SPOTIFY_ACCESS_TOKEN;
    
    if (!accessToken) {
        console.error('❌ Please set SPOTIFY_ACCESS_TOKEN environment variable');
        console.error('   Example: SPOTIFY_ACCESS_TOKEN=your-token tsx test-spotify-simple.ts');
        process.exit(1);
    }

    await testSpotifyPaginationSimple(accessToken);
}

// Run the test
main().catch(console.error); 