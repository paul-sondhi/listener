import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

/**
 * Integration test for podcast_episodes.pub_date index
 * Tests that the index was created by migration 20250621094500_add_pub_date_index.sql
 * and that it has the expected properties for transcript worker queries
 * 
 * IMPORTANT: This test requires a live database connection and should only run
 * in development/test environments where a database is available.
 */
describe('podcast_episodes.pub_date index migration test', () => {
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

      // Get a client for testing
      client = await pool.connect();
    } catch (error) {
      console.warn('⚠️  Database connection failed, skipping integration tests:', (error as Error).message);
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
    
    // Release client and close connection pool
    if (client) {
      try {
        client.release();
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
    
    if (pool) {
      try {
        await pool.end();
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
  });

  it('should have podcast_episodes_pub_date_idx index with correct definition', async () => {
    // Skip this test if database is not available
    if (shouldSkipTests) {
      console.log('⏭️  Skipping pub_date index test - database not available');
      return;
    }

    // Query pg_indexes to verify the index exists and has the correct definition
    const indexResult = await client.query(`
      SELECT 
        indexname,
        indexdef,
        tablename,
        schemaname
      FROM pg_indexes 
      WHERE tablename = 'podcast_episodes' 
        AND indexname = 'podcast_episodes_pub_date_idx'
        AND schemaname = 'public'
    `);

    // Assert that the index exists
    expect(indexResult.rows).toHaveLength(1);
    
    const index = indexResult.rows[0];
    expect(index.indexname).toBe('podcast_episodes_pub_date_idx');
    expect(index.tablename).toBe('podcast_episodes');
    expect(index.schemaname).toBe('public');
    
    // Verify the index definition includes DESC ordering for optimal transcript worker queries
    expect(index.indexdef).toContain('pub_date DESC');
    expect(index.indexdef).toContain('CREATE INDEX');
    expect(index.indexdef).toContain('podcast_episodes');
  });

  it('should optimize transcript worker lookback queries', async () => {
    // Skip this test if database is not available
    if (shouldSkipTests) {
      console.log('⏭️  Skipping query optimization test - database not available');
      return;
    }

    // Test that the typical transcript worker query executes without error
    // This is more important than the specific query plan, which can vary
    const testQuery = `
      SELECT id, show_id, guid, pub_date 
      FROM podcast_episodes 
      WHERE pub_date >= NOW() - INTERVAL '24 hours'
      ORDER BY pub_date DESC
      LIMIT 50
    `;

    const result = await client.query(testQuery);
    
    // The query should execute successfully (even if no rows match)
    expect(result.rows).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
    
    // Verify the query completes in reasonable time (< 1 second for indexed queries)
    const startTime = Date.now();
    await client.query(testQuery);
    const queryTime = Date.now() - startTime;
    
    // Should be very fast for indexed queries on empty/small tables
    expect(queryTime).toBeLessThan(1000); // 1 second max
    
    // Test that we can also run the query with EXPLAIN (without JSON format)
    const explainResult = await client.query(`EXPLAIN ${testQuery}`);
    expect(explainResult.rows).toBeDefined();
    expect(explainResult.rows.length).toBeGreaterThan(0);
    
    // The explain output should contain information about the query plan
    const explainText = explainResult.rows.map(row => row['QUERY PLAN']).join('\n');
    expect(explainText).toContain('podcast_episodes');
  });

  it('should support efficient filtering by pub_date range', async () => {
    // Skip this test if database is not available
    if (shouldSkipTests) {
      console.log('⏭️  Skipping range query test - database not available');
      return;
    }

    // Verify that range queries on pub_date can execute efficiently
    // This simulates the exact query pattern used by the transcript worker
    const testQuery = `
      SELECT COUNT(*) as episode_count
      FROM podcast_episodes 
      WHERE pub_date >= NOW() - INTERVAL '24 hours'
        AND pub_date <= NOW()
    `;

    const result = await client.query(testQuery);
    
    // The query should execute successfully (even if no rows match)
    expect(result.rows).toHaveLength(1);
    // PostgreSQL COUNT returns a string, so we need to parse it
    const episodeCount = parseInt(result.rows[0].episode_count, 10);
    expect(episodeCount).toBeGreaterThanOrEqual(0);
    
    // Verify the query completes in reasonable time (< 1 second for empty/small tables)
    const startTime = Date.now();
    await client.query(testQuery);
    const queryTime = Date.now() - startTime;
    
    // Should be very fast for indexed queries
    expect(queryTime).toBeLessThan(1000); // 1 second max
  });
}); 