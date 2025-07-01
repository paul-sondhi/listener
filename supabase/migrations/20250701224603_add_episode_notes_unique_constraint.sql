-- 2025-07-01 22:30:00 UTC
-- Adds a unique constraint on episode_id in episode_transcript_notes to allow upsert(onConflict='episode_id')

alter table if exists public.episode_transcript_notes
  add constraint episode_transcript_notes_episode_id_key unique (episode_id); 