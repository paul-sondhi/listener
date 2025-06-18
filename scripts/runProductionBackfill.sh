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
export SUPABASE_URL="https://pgsdmvubrqgingyyteef.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnc2RtdnVicnFnaW5neXl0ZWVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Nzc3Nzk3MCwiZXhwIjoyMDYzMzUzOTcwfQ.zLHYwEHlI9lfNc4BpWilNkSe4xXs5ggwG1hXgfW7cqo"
export PODCASTINDEX_KEY="ARJSFP78QT2LHREW8ZPF"
export PODCASTINDEX_SECRET="2AHkcNM7r^sgJ4NveYES7V2SkCA2$6jzx3GDKpWB"
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