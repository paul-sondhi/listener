-- Migration: Add transcripts table for podcast episode transcripts
-- Created: 2025-06-20 00:46:51 UTC
-- Purpose: Store transcript metadata with references to files in Supabase Storage

-- ► transcripts: Metadata for podcast episode transcripts stored in Supabase Storage
create table transcripts (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null
                  references podcast_episodes(id)
                  on delete cascade,
  storage_path  text not null,              -- full path in transcripts bucket (e.g. show123/episode456.jsonl.gz)
  status        text not null,              -- pending, available, error
  word_count    int4,                       -- optional analytics helper (populated later)
  created_at    timestamptz default timezone('utc', now()),
  updated_at    timestamptz default timezone('utc', now()),
  deleted_at    timestamptz,                -- soft delete: set timestamp instead of hard delete
  unique (episode_id),                      -- guarantee exactly one transcript per episode
  check (status in ('pending', 'available', 'error'))  -- restrict status to valid values
);

-- ► Index for fast "show me all pending transcripts" dashboard queries
create index transcripts_status_idx
  on transcripts(status);

-- ► Trigger to automatically update the updated_at timestamp on row updates
create or replace function update_transcripts_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger transcripts_updated_at_trigger
  before update on transcripts
  for each row
  execute function update_transcripts_updated_at();

-- ► Soft Delete Policy
-- To "delete" a transcript record, set deleted_at = timezone('utc', now()) instead of using DELETE.
-- This preserves audit trail and allows for recovery if needed.
-- Application queries should filter WHERE deleted_at IS NULL to exclude soft-deleted records. 