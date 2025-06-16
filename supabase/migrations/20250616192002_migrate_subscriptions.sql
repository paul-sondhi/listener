-- Migration: Convert podcast_subscriptions to user_podcast_subscriptions
-- Created: 2025-01-16 19:20:02 UTC
-- Purpose: Migrate subscription data to use normalized podcast_shows table and update RLS/triggers

-- ► Start transaction to keep migration atomic
begin;

-- ► 2.3 · Add show_id FK column
alter table podcast_subscriptions
  add column show_id uuid references podcast_shows(id);

-- ► 2.4 · Back-fill podcast_shows with distinct podcast_url values
insert into podcast_shows (rss_url)
select distinct podcast_url
from podcast_subscriptions
on conflict (rss_url) do nothing;

-- ► 2.5 · Update podcast_subscriptions rows so show_id is correctly populated
update podcast_subscriptions s
set    show_id = p.id
from   podcast_shows p
where  s.podcast_url = p.rss_url;

-- ► 2.6 · Drop old unique index on (user_id, podcast_url)
drop index if exists podcast_subscriptions_user_id_podcast_url_key;

-- ► 2.7 · Make show_id mandatory
alter table podcast_subscriptions
  alter column show_id set not null;

-- ► 2.8 · Drop old podcast_url column
alter table podcast_subscriptions
  drop column podcast_url;

-- ► 2.9 · Rename table to user_podcast_subscriptions
alter table podcast_subscriptions
  rename to user_podcast_subscriptions;

-- ► 2.10 · Create new unique index on (user_id, show_id) and helper index on user_id
create unique index user_podcast_subscriptions_uid_sid_key
  on user_podcast_subscriptions(user_id, show_id);

create index user_podcast_subscriptions_uid_idx
  on user_podcast_subscriptions(user_id);   -- RLS helper

-- ► 2.11 · Enable RLS on new table; recreate select / insert / delete policies
alter table user_podcast_subscriptions enable row level security;

create policy "sel_own"
  on user_podcast_subscriptions
  for select using (auth.uid() = user_id);

create policy "ins_own"
  on user_podcast_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "del_own"
  on user_podcast_subscriptions
  for delete using (auth.uid() = user_id);

-- ► 2.12 · Create or replace set_updated_at() trigger function (UTC) and attach trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;

drop trigger if exists touch_updated_at
  on user_podcast_subscriptions;

create trigger touch_updated_at
  before update on user_podcast_subscriptions
  for each row execute procedure set_updated_at();

-- ► End transaction
commit; 