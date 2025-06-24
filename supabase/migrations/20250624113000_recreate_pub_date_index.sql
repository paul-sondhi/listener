-- migrate: disable_ddl_transaction

-- Re-create DESC index on podcast_episodes.pub_date for transcript worker queries
-- Runs outside of a transaction because CREATE INDEX CONCURRENTLY is not allowed inside one.

DROP INDEX IF EXISTS podcast_episodes_pub_date_idx;

CREATE INDEX CONCURRENTLY podcast_episodes_pub_date_idx
  ON podcast_episodes (pub_date DESC); 