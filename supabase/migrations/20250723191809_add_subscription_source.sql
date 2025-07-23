-- Add subscription_source to user_podcast_subscriptions table
-- This tracks how a subscription was added: spotify, opml, or manual

-- Add the subscription_source column with a default value
ALTER TABLE user_podcast_subscriptions 
ADD COLUMN subscription_source TEXT DEFAULT 'spotify' NOT NULL;

-- Add a check constraint to ensure only valid values
ALTER TABLE user_podcast_subscriptions
ADD CONSTRAINT subscription_source_check CHECK (subscription_source IN ('spotify', 'opml', 'manual'));

-- Create an index on subscription_source for efficient filtering
CREATE INDEX idx_user_podcast_subscriptions_source ON user_podcast_subscriptions(subscription_source);

-- Update existing records to have 'spotify' as the source
-- (not needed since we set the default, but included for clarity)
UPDATE user_podcast_subscriptions 
SET subscription_source = 'spotify' 
WHERE subscription_source IS NULL;

-- Comment on the column for documentation
COMMENT ON COLUMN user_podcast_subscriptions.subscription_source IS 'Source of the subscription: spotify (from Spotify API), opml (from OPML file upload), or manual (manually added)';