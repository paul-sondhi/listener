-- Add deleted_at column to user_podcast_subscriptions for soft delete support
ALTER TABLE user_podcast_subscriptions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL;

-- Add a comment to document the column's purpose
COMMENT ON COLUMN user_podcast_subscriptions.deleted_at IS 'Timestamp for soft deletion of user podcast subscriptions. Null means active.'; 