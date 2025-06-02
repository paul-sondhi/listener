create type "public"."subscription_status" as enum ('active', 'inactive');

create table "public"."podcast_subscriptions" (
    "id" uuid not null default uuid_generate_v4(),
    "user_id" uuid,
    "podcast_url" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "status" subscription_status not null default 'active'::subscription_status
);


alter table "public"."podcast_subscriptions" enable row level security;

create table "public"."users" (
    "id" uuid not null default uuid_generate_v4(),
    "spotify_id" text,
    "email" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "spotify_token_expires_at" timestamp with time zone,
    "spotify_access_token" text,
    "spotify_refresh_token" text
);


alter table "public"."users" enable row level security;

CREATE INDEX idx_podcast_subscriptions_user ON public.podcast_subscriptions USING btree (user_id);

CREATE UNIQUE INDEX podcast_subscriptions_pkey ON public.podcast_subscriptions USING btree (id);

CREATE UNIQUE INDEX podcast_subscriptions_user_id_podcast_url_key ON public.podcast_subscriptions USING btree (user_id, podcast_url);

CREATE UNIQUE INDEX podcast_subscriptions_user_podcast_unique ON public.podcast_subscriptions USING btree (user_id, podcast_url);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX users_spotify_id_key ON public.users USING btree (spotify_id);

alter table "public"."podcast_subscriptions" add constraint "podcast_subscriptions_pkey" PRIMARY KEY using index "podcast_subscriptions_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."podcast_subscriptions" add constraint "fk_podcast_subscriptions_user" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."podcast_subscriptions" validate constraint "fk_podcast_subscriptions_user";

alter table "public"."podcast_subscriptions" add constraint "podcast_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."podcast_subscriptions" validate constraint "podcast_subscriptions_user_id_fkey";

alter table "public"."podcast_subscriptions" add constraint "podcast_subscriptions_user_id_podcast_url_key" UNIQUE using index "podcast_subscriptions_user_id_podcast_url_key";

alter table "public"."podcast_subscriptions" add constraint "podcast_subscriptions_user_podcast_unique" UNIQUE using index "podcast_subscriptions_user_podcast_unique";

alter table "public"."users" add constraint "users_auth_fk" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_auth_fk";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

alter table "public"."users" add constraint "users_spotify_id_key" UNIQUE using index "users_spotify_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_spotify_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (new.provider) = 'spotify' then
    update public.users
    set spotify_id = new.id, updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_spotify_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.provider = 'spotify' then
    insert into public.users (id, email, spotify_id, created_at, updated_at)
    values (
      new.user_id,                          -- = auth.users.id
      coalesce(new.identity_data ->> 'email', ''), 
      new.id,                               -- = auth.identities.id
      now(), now()
    )
    on conflict (id)              -- ← prevents duplicates
    do update set
      email       = excluded.email,
      spotify_id  = excluded.spotify_id,
      updated_at  = now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_spotify_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- run only for Spotify sign-ups
  if (new.raw_app_meta_data ->> 'provider') = 'spotify' then
    /* insert basic profile; spotify_id comes later (step 4) */
    insert into public.users (id, email, created_at, updated_at)
    values (new.id, new.email, now(), now());
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."podcast_subscriptions" to "anon";

grant insert on table "public"."podcast_subscriptions" to "anon";

grant references on table "public"."podcast_subscriptions" to "anon";

grant select on table "public"."podcast_subscriptions" to "anon";

grant trigger on table "public"."podcast_subscriptions" to "anon";

grant truncate on table "public"."podcast_subscriptions" to "anon";

grant update on table "public"."podcast_subscriptions" to "anon";

grant delete on table "public"."podcast_subscriptions" to "authenticated";

grant insert on table "public"."podcast_subscriptions" to "authenticated";

grant references on table "public"."podcast_subscriptions" to "authenticated";

grant select on table "public"."podcast_subscriptions" to "authenticated";

grant trigger on table "public"."podcast_subscriptions" to "authenticated";

grant truncate on table "public"."podcast_subscriptions" to "authenticated";

grant update on table "public"."podcast_subscriptions" to "authenticated";

grant delete on table "public"."podcast_subscriptions" to "service_role";

grant insert on table "public"."podcast_subscriptions" to "service_role";

grant references on table "public"."podcast_subscriptions" to "service_role";

grant select on table "public"."podcast_subscriptions" to "service_role";

grant trigger on table "public"."podcast_subscriptions" to "service_role";

grant truncate on table "public"."podcast_subscriptions" to "service_role";

grant update on table "public"."podcast_subscriptions" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

create policy "Users can delete their own subscriptions"
on "public"."podcast_subscriptions"
as permissive
for delete
to public
using ((auth.uid() = user_id));


create policy "Users can insert their own subscriptions"
on "public"."podcast_subscriptions"
as permissive
for insert
to public
with check ((auth.uid() = user_id));


create policy "Users can view their own subscriptions"
on "public"."podcast_subscriptions"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "delete_own"
on "public"."podcast_subscriptions"
as permissive
for delete
to public
using ((user_id = auth.uid()));


create policy "insert_own"
on "public"."podcast_subscriptions"
as permissive
for insert
to public
with check ((user_id = auth.uid()));


create policy "select_own"
on "public"."podcast_subscriptions"
as permissive
for select
to public
using ((user_id = auth.uid()));


create policy "update_own"
on "public"."podcast_subscriptions"
as permissive
for update
to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Users can update their own data"
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = id));


create policy "Users can view their own data"
on "public"."users"
as permissive
for select
to public
using ((auth.uid() = id));


CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON public.podcast_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


