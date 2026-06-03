create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.matches_cache (
  id text primary key,
  sport_key text not null,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  home_odds numeric(5,2),
  away_odds numeric(5,2),
  draw_odds numeric(5,2),
  status text default 'uncommenced' not null,
  home_score integer,
  away_score integer,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  room_name text not null,
  passcode varchar(4) not null,
  created_by uuid not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.room_members (
  id bigint generated always as identity primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  guest_id uuid not null,
  display_name text not null,
  joined_at timestamptz default timezone('utc'::text, now()) not null,
  unique(room_id, guest_id)
);

create table if not exists public.challenges (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  match_id text references public.matches_cache(id) not null,
  challenger_id uuid not null,
  defender_id uuid not null,
  challenger_pick text not null,
  defender_pick text not null,
  punishment text not null,
  proof_url text,
  status text default 'pending' not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_cache_status_check'
  ) then
    alter table public.matches_cache
      add constraint matches_cache_status_check
      check (status in ('uncommenced', 'live', 'completed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_passcode_format_check'
  ) then
    alter table public.rooms
      add constraint rooms_passcode_format_check
      check (passcode ~ '^[0-9]{4}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_challenger_pick_check'
  ) then
    alter table public.challenges
      add constraint challenges_challenger_pick_check
      check (challenger_pick in ('home', 'away', 'draw'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_defender_pick_check'
  ) then
    alter table public.challenges
      add constraint challenges_defender_pick_check
      check (defender_pick in ('home', 'away', 'draw'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_status_check'
  ) then
    alter table public.challenges
      add constraint challenges_status_check
      check (
        status in (
          'pending',
          'accepted',
          'rejected',
          'active',
          'challenger_won',
          'defender_won',
          'completed'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_self_challenge_check'
  ) then
    alter table public.challenges
      add constraint challenges_self_challenge_check
      check (challenger_id <> defender_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_punishment_not_blank_check'
  ) then
    alter table public.challenges
      add constraint challenges_punishment_not_blank_check
      check (length(trim(punishment)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_proof_url_not_blank_check'
  ) then
    alter table public.challenges
      add constraint challenges_proof_url_not_blank_check
      check (proof_url is null or length(trim(proof_url)) > 0);
  end if;
end
$$;

create index if not exists idx_matches_cache_commence_time_status
  on public.matches_cache (commence_time, status);

create index if not exists idx_room_members_room_id
  on public.room_members (room_id);

create index if not exists idx_room_members_guest_id_room_id
  on public.room_members (guest_id, room_id);

create index if not exists idx_challenges_room_id_status
  on public.challenges (room_id, status);

create index if not exists idx_challenges_match_id_status
  on public.challenges (match_id, status);

create or replace function public.request_guest_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'guest_id', ''),
    nullif(
      (coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-guest-id'),
      ''
    )
  );
$$;

create or replace function public.is_challenge_actor_ids(
  challenger uuid,
  defender uuid
)
returns boolean
language sql
stable
as $$
  select (
    challenger::text = public.request_guest_id()
    or defender::text = public.request_guest_id()
  );
$$;

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = target_room_id
      and rm.guest_id::text = public.request_guest_id()
  );
$$;

create or replace function public.enforce_challenge_update_guardrails()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    if new.room_id <> old.room_id
      or new.match_id <> old.match_id
      or new.challenger_id <> old.challenger_id
      or new.defender_id <> old.defender_id
      or new.challenger_pick <> old.challenger_pick
      or new.defender_pick <> old.defender_pick
      or new.punishment <> old.punishment
      or new.created_at <> old.created_at then
      raise exception 'Only status and proof_url can be updated by participants';
    end if;

    if old.status = 'pending' and new.status not in ('pending', 'accepted', 'rejected') then
      raise exception 'Invalid challenge status transition from pending';
    end if;

    if old.status in ('challenger_won', 'defender_won', 'completed')
      and new.status not in ('challenger_won', 'defender_won', 'completed') then
      raise exception 'Invalid challenge status transition for proof workflow';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists challenges_update_guardrails_trigger on public.challenges;

create trigger challenges_update_guardrails_trigger
before update on public.challenges
for each row
execute function public.enforce_challenge_update_guardrails();

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.challenges enable row level security;

drop policy if exists rooms_select_member_scope on public.rooms;
create policy rooms_select_member_scope
on public.rooms
for select
using (
  auth.role() = 'service_role'
  or public.is_room_member(id)
);

drop policy if exists rooms_insert_creator_only on public.rooms;
create policy rooms_insert_creator_only
on public.rooms
for insert
with check (
  auth.role() = 'service_role'
  or created_by::text = public.request_guest_id()
);

drop policy if exists rooms_update_host_only on public.rooms;
create policy rooms_update_host_only
on public.rooms
for update
using (
  auth.role() = 'service_role'
  or created_by::text = public.request_guest_id()
)
with check (
  auth.role() = 'service_role'
  or created_by::text = public.request_guest_id()
);

drop policy if exists rooms_delete_host_only on public.rooms;
create policy rooms_delete_host_only
on public.rooms
for delete
using (
  auth.role() = 'service_role'
  or created_by::text = public.request_guest_id()
);

drop policy if exists room_members_select_room_scope on public.room_members;
create policy room_members_select_room_scope
on public.room_members
for select
using (
  auth.role() = 'service_role'
  or public.is_room_member(room_id)
);

drop policy if exists room_members_insert_self_join_only on public.room_members;
create policy room_members_insert_self_join_only
on public.room_members
for insert
with check (
  auth.role() = 'service_role'
  or (
    guest_id::text = public.request_guest_id()
    and exists (
      select 1
      from public.rooms r
      where r.id = room_id
    )
  )
);

drop policy if exists room_members_update_service_role_only on public.room_members;
create policy room_members_update_service_role_only
on public.room_members
for update
using (
  auth.role() = 'service_role'
)
with check (
  auth.role() = 'service_role'
);

drop policy if exists room_members_delete_self_or_service on public.room_members;
create policy room_members_delete_self_or_service
on public.room_members
for delete
using (
  auth.role() = 'service_role'
  or guest_id::text = public.request_guest_id()
);

drop policy if exists challenges_select_room_scope on public.challenges;
create policy challenges_select_room_scope
on public.challenges
for select
using (
  auth.role() = 'service_role'
  or public.is_room_member(room_id)
);

drop policy if exists challenges_insert_challenger_scope on public.challenges;
create policy challenges_insert_challenger_scope
on public.challenges
for insert
with check (
  auth.role() = 'service_role'
  or (
    challenger_id::text = public.request_guest_id()
    and public.is_room_member(room_id)
    and exists (
      select 1
      from public.room_members rm
      where rm.room_id = room_id
        and rm.guest_id = defender_id
    )
    and challenger_id <> defender_id
  )
);

drop policy if exists challenges_update_defender_response on public.challenges;
create policy challenges_update_defender_response
on public.challenges
for update
using (
  auth.role() = 'service_role'
  or (
    defender_id::text = public.request_guest_id()
    and status = 'pending'
  )
)
with check (
  auth.role() = 'service_role'
  or (
    defender_id::text = public.request_guest_id()
    and status in ('accepted', 'rejected')
  )
);

drop policy if exists challenges_update_proof_by_participant on public.challenges;
create policy challenges_update_proof_by_participant
on public.challenges
for update
using (
  auth.role() = 'service_role'
  or (
    public.is_challenge_actor_ids(challenger_id, defender_id)
    and status in ('challenger_won', 'defender_won', 'completed')
  )
)
with check (
  auth.role() = 'service_role'
  or (
    public.is_challenge_actor_ids(challenger_id, defender_id)
    and status in ('challenger_won', 'defender_won', 'completed')
    and proof_url is not null
    and length(trim(proof_url)) > 0
  )
);

drop policy if exists challenges_delete_service_role_only on public.challenges;
create policy challenges_delete_service_role_only
on public.challenges
for delete
using (auth.role() = 'service_role');

alter table public.challenges replica identity full;
alter table public.room_members replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.challenges;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.room_members;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;
