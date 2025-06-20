#!/bin/bash

# RSS URL Update Script Runner
# Safely executes the updateAllRssUrls.ts script with proper environment setup

set -e  # Exit on any error

echo "🚀 RSS URL Update Script Runner"
echo "==============================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: This script must be run from the project root directory"
    echo "   Current directory: $(pwd)"
    echo "   Please cd to the listener directory first"
    exit 1
fi

# Check if the TypeScript script exists
if [ ! -f "scripts/updateAllRssUrls.ts" ]; then
    echo "❌ Error: scripts/updateAllRssUrls.ts not found"
    exit 1
fi

# Validate required environment variables
echo "🔍 Checking environment variables..."

required_vars=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY" 
    "PODCASTINDEX_KEY"
    "PODCASTINDEX_SECRET"
    "SPOTIFY_CLIENT_ID"
    "SPOTIFY_CLIENT_SECRET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    else
        echo "  ✅ $var is set"
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo ""
    echo "❌ Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please set these variables in your .env.local file or environment"
    exit 1
fi

echo "  ✅ All required environment variables are set"
echo ""

# Show current database info (safely)
if [[ "$SUPABASE_URL" == *"supabase.co"* ]]; then
    echo "⚠️  WARNING: You are targeting a PRODUCTION Supabase instance!"
    echo "   URL: $SUPABASE_URL"
else
    echo "🔧 Targeting development/local database:"
    echo "   URL: $SUPABASE_URL"
fi

echo ""

# Confirm execution
echo "📋 This script will:"
echo "   1. Query ALL rows in the podcast_shows table"
echo "   2. For each show, attempt to find the real RSS feed URL"
echo "   3. Update the database with proper RSS URLs and titles"
echo "   4. Process shows in batches to be gentle on APIs"
echo ""

if [[ "$SUPABASE_URL" == *"supabase.co"* ]] || [[ "$NODE_ENV" == "production" ]]; then
    echo "⚠️  PRODUCTION WARNING: This will modify production data!"
    echo "   - Consider running during off-peak hours"
    echo "   - This will make many API calls to external services"
    echo "   - The script includes rate limiting but still use caution"
    echo ""
fi

read -p "Do you want to continue? (yes/no): " confirm

if [[ $confirm != "yes" ]]; then
    echo "❌ Operation cancelled by user"
    exit 0
fi

echo ""
echo "🏃 Starting RSS URL update process..."
echo "⏱️  Estimated time: 1-2 minutes per 10 shows (depends on API response times)"
echo ""

# Export USER_AGENT if not set
if [ -z "$USER_AGENT" ]; then
    export USER_AGENT="Listener-App/1.0"
    echo "📱 Set USER_AGENT to: $USER_AGENT"
fi

# Log start time
start_time=$(date)
echo "🕐 Started at: $start_time"
echo ""

# Run the TypeScript script using tsx (which should be available in node_modules)
if command -v tsx &> /dev/null; then
    tsx scripts/updateAllRssUrls.ts
elif [ -f "node_modules/.bin/tsx" ]; then
    ./node_modules/.bin/tsx scripts/updateAllRssUrls.ts
elif command -v ts-node &> /dev/null; then
    ts-node scripts/updateAllRssUrls.ts
elif [ -f "node_modules/.bin/ts-node" ]; then
    ./node_modules/.bin/ts-node scripts/updateAllRssUrls.ts
else
    echo "❌ Error: Could not find tsx or ts-node to run TypeScript script"
    echo "   Please install tsx: npm install -g tsx"
    echo "   Or ensure ts-node is available"
    exit 1
fi

# Capture exit code
exit_code=$?

# Log completion
end_time=$(date)
echo ""
echo "🏁 Completed at: $end_time"
echo "📊 Exit code: $exit_code"

if [ $exit_code -eq 0 ]; then
    echo "✅ RSS URL update completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Review the output above for any warnings"
    echo "   2. Deploy your subscription refresh service fix"
    echo "   3. Monitor the daily subscription job for success"
else
    echo "❌ RSS URL update failed with exit code $exit_code"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   1. Check the error messages above"
    echo "   2. Verify your environment variables are correct"
    echo "   3. Check your network connection and API limits"
    echo "   4. Consider running the script again for failed shows"
fi

exit $exit_code 