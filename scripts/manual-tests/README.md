# Manual Test Scripts

This directory contains manual testing scripts used for debugging and development purposes.

## Scripts

### test-daily-matching.ts
Tests the enhanced RSS feed matching algorithm with "The Daily" podcast to ensure the matching logic works correctly.

### test-spotify-pagination.ts
Tests Spotify API pagination for a specific user to verify that pagination is working correctly when fetching user's shows.

### test-spotify-simple.ts
A simpler version of the Spotify pagination test that takes an access token directly for easier testing.

## Usage

These scripts can be run directly using tsx:

```bash
# From the project root
npx tsx scripts/manual-tests/test-daily-matching.ts
npx tsx scripts/manual-tests/test-spotify-pagination.ts
npx tsx scripts/manual-tests/test-spotify-simple.ts
```

Note: Some scripts may require environment variables or manual configuration of test data.