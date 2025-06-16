import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

/**
 * Integration test for podcast schema migration
 * Tests the conversion from podcast_subscriptions to user_podcast_subscriptions
 * with proper data migration and FK relationships
 * 
 * IMPORTANT: This test requires a live database connection and should only run
 * in development/test environments where a database is available.
 */
describe('Podcast schema migration integration test', () => {
  let pool: Pool;
  let client: any;
  let shouldSkipTests = false;

  beforeAll(async () => {
    // Skip integration tests if we're in CI/production without a test database
    // or if the DATABASE_URL_TEST environment variable indicates to skip
    const isCI = process.env.CI === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    const skipIntegrationTests = process.env.SKIP_INTEGRATION_TESTS === 'true';
    const simulateProductionDeployment = process.env.SIMULATE_PRODUCTION_DEPLOYMENT === 'true';
    const databaseTestUrl = process.env.DATABASE_URL_TEST;
    
    // Check if we should skip these tests
    if (skipIntegrationTests || (isCI && !databaseTestUrl) || (isProduction && !databaseTestUrl) || simulateProductionDeployment) {
      shouldSkipTests = true;
      console.log('⏭️  Skipping database integration tests - no database available or explicitly disabled');
      return;
    }

    try {
      // Initialize connection pool to test database
      pool = new Pool({
        connectionString: databaseTestUrl || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        // Add connection timeout to fail fast if database is not available
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      });

      // Test the connection before proceeding
      const testClient = await pool.connect();
      testClient.release();

      // Get a client and start a transaction for isolated testing
      client = await pool.connect();
      await client.query('BEGIN');
    } catch (error) {
      console.warn('⚠️  Database connection failed, skipping integration tests:', error.message);
      shouldSkipTests = true;
      
      // Clean up pool if it was created
      if (pool) {
        try {
          await pool.end();
        } catch (_cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  });

  afterAll(async () => {
    if (shouldSkipTests) return;
    
    // Rollback transaction to leave database unchanged
    if (client) {
      try {
        await client.query('ROLLBACK');
        client.release();
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
    
    // Close connection pool
    if (pool) {
      try {
        await pool.end();
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
  });

  it('should migrate podcast_subscriptions to user_podcast_subscriptions with proper FK relationships', async () => {
    // Skip this test if database is not available
    if (shouldSkipTests) {
      console.log('⏭️  Skipping migration test - database not available');
      return;
    }

    // Step 1: Create test-specific table names to avoid conflicts
    const testTablePrefix = 'test_' + Date.now() + '_';
    
    // Step 2: Create core tables with test prefix
    await client.query(`
      CREATE TABLE ${testTablePrefix}podcast_shows (
        id uuid primary key default gen_random_uuid(),
        rss_url text not null unique,
        title text,
        description text,
        image_url text,
        etag text,
        last_modified timestamptz,
        last_fetched timestamptz,
        last_updated timestamptz default timezone('utc', now())
      );
      
      CREATE TABLE ${testTablePrefix}podcast_episodes (
        id uuid primary key default gen_random_uuid(),
        show_id uuid not null references ${testTablePrefix}podcast_shows(id) on delete cascade,
        guid text not null,
        episode_url text not null,
        title text,
        description text,
        pub_date timestamptz,
        duration_sec int4,
        created_at timestamptz default timezone('utc', now()),
        unique(show_id, guid)
      );
    `);

    // Step 3: Create old-style podcast_subscriptions table
    await client.query(`
      CREATE TABLE ${testTablePrefix}podcast_subscriptions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid,
        podcast_url text not null,
        created_at timestamptz default timezone('utc', now()),
        updated_at timestamptz default timezone('utc', now()),
        status text default 'active'
      )
    `);

    // Step 4: Insert test data in legacy format
    const testUserId = '00000000-0000-4000-8000-000000000001';
    const testPodcastUrl = 'https://example.com/test-feed.rss';
    
    await client.query(`
      INSERT INTO ${testTablePrefix}podcast_subscriptions (user_id, podcast_url)
      VALUES ($1, $2)
    `, [testUserId, testPodcastUrl]);

    // Step 5: Apply the subscription migration logic manually with test table names
    await client.query(`
      -- Add show_id column
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        ADD COLUMN show_id uuid references ${testTablePrefix}podcast_shows(id);
      
      -- Back-fill podcast_shows
      INSERT INTO ${testTablePrefix}podcast_shows (rss_url)
      SELECT DISTINCT podcast_url
      FROM ${testTablePrefix}podcast_subscriptions
      ON CONFLICT (rss_url) DO NOTHING;
      
      -- Update subscriptions with show_id
      UPDATE ${testTablePrefix}podcast_subscriptions s
      SET show_id = p.id
      FROM ${testTablePrefix}podcast_shows p
      WHERE s.podcast_url = p.rss_url;
      
      -- Make show_id mandatory and drop old column
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        ALTER COLUMN show_id SET NOT NULL,
        DROP COLUMN podcast_url;
      
      -- Rename table
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        RENAME TO ${testTablePrefix}user_podcast_subscriptions;
    `);

    // Step 6: Verify the migration results
    
    // Check that user_podcast_subscriptions table exists and has the migrated data
    const subscriptionResult = await client.query(`
      SELECT s.id, s.user_id, s.show_id, s.status, s.created_at, s.updated_at
      FROM ${testTablePrefix}user_podcast_subscriptions s
      WHERE s.user_id = $1
    `, [testUserId]);

    expect(subscriptionResult.rows).toHaveLength(1);
    const subscription = subscriptionResult.rows[0];
    expect(subscription.user_id).toBe(testUserId);
    expect(subscription.show_id).toBeTruthy(); // Should have a valid UUID
    expect(subscription.status).toBe('active');

    // Check that podcast_shows table has the RSS URL
    const showResult = await client.query(`
      SELECT p.id, p.rss_url, p.title, p.last_updated
      FROM ${testTablePrefix}podcast_shows p
      WHERE p.id = $1
    `, [subscription.show_id]);

    expect(showResult.rows).toHaveLength(1);
    const show = showResult.rows[0];
    expect(show.rss_url).toBe(testPodcastUrl);
    expect(show.last_updated).toBeTruthy();

    // Check that the FK relationship works
    const joinResult = await client.query(`
      SELECT s.id as subscription_id, s.user_id, p.rss_url, p.id as show_id
      FROM ${testTablePrefix}user_podcast_subscriptions s
      JOIN ${testTablePrefix}podcast_shows p ON p.id = s.show_id
      WHERE s.user_id = $1
    `, [testUserId]);

    expect(joinResult.rows).toHaveLength(1);
    const joinedData = joinResult.rows[0];
    expect(joinedData.user_id).toBe(testUserId);
    expect(joinedData.rss_url).toBe(testPodcastUrl);
    expect(joinedData.show_id).toBe(subscription.show_id);

    // Clean up test tables
    await client.query(`
      DROP TABLE IF EXISTS ${testTablePrefix}user_podcast_subscriptions CASCADE;
      DROP TABLE IF EXISTS ${testTablePrefix}podcast_episodes CASCADE;
      DROP TABLE IF EXISTS ${testTablePrefix}podcast_shows CASCADE;
    `);
  });

  it('should handle multiple subscriptions to different shows correctly', async () => {
    // Skip this test if database is not available
    if (shouldSkipTests) {
      console.log('⏭️  Skipping multiple subscriptions migration test - database not available');
      return;
    }

    // Create test-specific table names to avoid conflicts
    const testTablePrefix = 'test_multi_' + Date.now() + '_';
    
    // Set up multiple subscriptions for the same user
    const testUserId = '00000000-0000-4000-8000-000000000002';
    const podcastUrls = [
      'https://example.com/show1.rss',
      'https://example.com/show2.rss',
      'https://example.com/show3.rss'
    ];

    // Create core tables with test prefix
    await client.query(`
      CREATE TABLE ${testTablePrefix}podcast_shows (
        id uuid primary key default gen_random_uuid(),
        rss_url text not null unique,
        title text,
        description text,
        image_url text,
        etag text,
        last_modified timestamptz,
        last_fetched timestamptz,
        last_updated timestamptz default timezone('utc', now())
      );
      
      CREATE TABLE ${testTablePrefix}podcast_episodes (
        id uuid primary key default gen_random_uuid(),
        show_id uuid not null references ${testTablePrefix}podcast_shows(id) on delete cascade,
        guid text not null,
        episode_url text not null,
        title text,
        description text,
        pub_date timestamptz,
        duration_sec int4,
        created_at timestamptz default timezone('utc', now()),
        unique(show_id, guid)
      );
    `);

    // Create legacy table and insert multiple subscriptions
    await client.query(`
      CREATE TABLE ${testTablePrefix}podcast_subscriptions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid,
        podcast_url text not null,
        created_at timestamptz default timezone('utc', now()),
        updated_at timestamptz default timezone('utc', now()),
        status text default 'active'
      )
    `);

    for (const url of podcastUrls) {
      await client.query(`
        INSERT INTO ${testTablePrefix}podcast_subscriptions (user_id, podcast_url)
        VALUES ($1, $2)
      `, [testUserId, url]);
    }

    // Apply the subscription migration logic manually with test table names
    await client.query(`
      -- Add show_id column
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        ADD COLUMN show_id uuid references ${testTablePrefix}podcast_shows(id);
      
      -- Back-fill podcast_shows
      INSERT INTO ${testTablePrefix}podcast_shows (rss_url)
      SELECT DISTINCT podcast_url
      FROM ${testTablePrefix}podcast_subscriptions
      ON CONFLICT (rss_url) DO NOTHING;
      
      -- Update subscriptions with show_id
      UPDATE ${testTablePrefix}podcast_subscriptions s
      SET show_id = p.id
      FROM ${testTablePrefix}podcast_shows p
      WHERE s.podcast_url = p.rss_url;
      
      -- Make show_id mandatory and drop old column
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        ALTER COLUMN show_id SET NOT NULL,
        DROP COLUMN podcast_url;
      
      -- Rename table
      ALTER TABLE ${testTablePrefix}podcast_subscriptions
        RENAME TO ${testTablePrefix}user_podcast_subscriptions;
    `);

    // Verify all subscriptions were migrated
    const result = await client.query(`
      SELECT s.user_id, s.show_id, p.rss_url
      FROM ${testTablePrefix}user_podcast_subscriptions s
      JOIN ${testTablePrefix}podcast_shows p ON p.id = s.show_id
      WHERE s.user_id = $1
      ORDER BY p.rss_url
    `, [testUserId]);

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map(r => r.rss_url)).toEqual(podcastUrls.sort());

    // Verify each subscription has a unique show_id
    const showIds = result.rows.map(r => r.show_id);
    const uniqueShowIds = [...new Set(showIds)];
    expect(uniqueShowIds).toHaveLength(3);

    // Clean up test tables
    await client.query(`
      DROP TABLE IF EXISTS ${testTablePrefix}user_podcast_subscriptions CASCADE;
      DROP TABLE IF EXISTS ${testTablePrefix}podcast_episodes CASCADE;
      DROP TABLE IF EXISTS ${testTablePrefix}podcast_shows CASCADE;
    `);
  });
}); 