#!/usr/bin/env node

// Compatibility shim: this script used to contain the migration validator.
// The real implementation was migrated to verify-database-migrations.mjs (ESM).
// We keep this thin wrapper so existing npm scripts and GitHub Actions continue to work.

(async () => {
  try {
    const { verifyDatabaseMigrations } = await import('./verify-database-migrations.mjs');
    await verifyDatabaseMigrations();
  } catch (err) {
    console.error('❌ Migration validation failed:', err?.message || err);
    process.exit(1);
  }
})(); 