#!/bin/bash

# RSS URL Backfill Runner for Production
# 
# INSTRUCTIONS:
# 1. Replace the values below with your actual production credentials
# 2. Run: chmod +x scripts/runProductionBackfill.sh
# 3. Run: ./scripts/runProductionBackfill.sh

echo "🔄 Starting RSS URL backfill for PRODUCTION database..."
echo "⚠️  Make sure you've updated the credentials below!"

# Set production environment variables
export SUPABASE_URL="https://<your-project-ref>.supabase.co"
# IMPORTANT: Store and retrieve these secrets from a secure location (e.g. 1Password, Vault, or CI secrets)
export SUPABASE_SERVICE_ROLE_KEY="<your_production_service_role_key>"
export PODCASTINDEX_KEY="<your_podcastindex_key>"
export PODCASTINDEX_SECRET="<your_podcastindex_secret>"
export NODE_ENV="production"

# Validate that credentials are set
if [[ -z "$SUPABASE_URL" ]]; then
    echo "❌ ERROR: SUPABASE_URL is not set"
    exit 1
fi

if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
    echo "❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is not set"
    exit 1
fi

echo "✅ Environment variables set"
echo "🎯 Target database: $SUPABASE_URL"
echo ""

# Change to scripts directory and run the backfill script
cd "$(dirname "$0")"
npx tsx backfillRssUrl.ts

echo ""
echo "✅ Backfill script completed!"
echo "🔍 Check your production database to verify RSS URLs were populated" 