ALTER TABLE podcast_subscriptions
DROP CONSTRAINT IF EXISTS podcast_subscriptions_user_id_fkey;

ALTER TABLE podcast_subscriptions
ADD CONSTRAINT podcast_subscriptions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE;