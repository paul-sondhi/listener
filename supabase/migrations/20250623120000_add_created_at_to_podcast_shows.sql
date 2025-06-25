-- Migration: Add timestamps to podcast_shows
-- Created: 2025-06-23 12:00:00 UTC
-- Purpose: Track creation and modification times for podcast shows

-- ► Add created_at and updated_at columns
alter table podcast_shows
  add column created_at timestamptz default timezone('utc', now()),
  add column updated_at timestamptz default timezone('utc', now());

-- ► Trigger to keep updated_at current
create or replace function update_podcast_shows_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger podcast_shows_updated_at_trigger
  before update on podcast_shows
  for each row execute function update_podcast_shows_updated_at();
