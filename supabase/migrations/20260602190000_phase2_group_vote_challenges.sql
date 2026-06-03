-- Phase 2: replace 1-vs-1 challenger/defender challenges with room-wide vote
-- challenges. The room host picks a match and a punishment, then every member
-- (host included) votes home or away until 10 minutes before kickoff.
-- A draw result means nobody wins or loses.

-- Drop the old table first: its policies and trigger depend on the helper
-- functions removed right after.
drop table if exists public.challenges cascade;

drop function if exists public.enforce_challenge_update_guardrails();
drop function if exists public.is_challenge_actor_ids(uuid, uuid);

create table public.challenges (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  match_id text references public.matches_cache(id) not null,
  created_by uuid not null,
  punishment text not null,
  voting_deadline timestamptz not null,
  status text default 'voting' not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  constraint challenges_status_check
    check (status in ('voting', 'home_won', 'away_won', 'draw')),
  constraint challenges_punishment_not_blank_check
    check (length(trim(punishment)) > 0),
  constraint challenges_room_match_unique unique (room_id, match_id)
);

create table public.challenge_votes (
  id bigint generated always as identity primary key,
  challenge_id uuid references public.challenges(id) on delete cascade not null,
  guest_id uuid not null,
  pick text not null,
  punishment_done boolean default false not null,
  voted_at timestamptz default timezone('utc'::text, now()) not null,
  constraint challenge_votes_pick_check
    check (pick in ('home', 'away')),
  constraint challenge_votes_unique_voter unique (challenge_id, guest_id)
);

create index if not exists idx_challenges_room_id_status
  on public.challenges (room_id, status);

create index if not exists idx_challenges_match_id_status
  on public.challenges (match_id, status);

create index if not exists idx_challenge_votes_challenge_id
  on public.challenge_votes (challenge_id);

create index if not exists idx_challenge_votes_guest_id
  on public.challenge_votes (guest_id);

alter table public.challenges enable row level security;
alter table public.challenge_votes enable row level security;

drop policy if exists challenges_select_room_scope on public.challenges;
create policy challenges_select_room_scope
on public.challenges
for select
using (
  auth.role() = 'service_role'
  or public.is_room_member(room_id)
);

drop policy if exists challenges_insert_host_only on public.challenges;
create policy challenges_insert_host_only
on public.challenges
for insert
with check (
  auth.role() = 'service_role'
  or (
    created_by::text = public.request_guest_id()
    and exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and r.created_by = created_by
    )
  )
);

drop policy if exists challenges_update_service_role_only on public.challenges;
create policy challenges_update_service_role_only
on public.challenges
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists challenges_delete_service_role_only on public.challenges;
create policy challenges_delete_service_role_only
on public.challenges
for delete
using (auth.role() = 'service_role');

drop policy if exists challenge_votes_select_room_scope on public.challenge_votes;
create policy challenge_votes_select_room_scope
on public.challenge_votes
for select
using (
  auth.role() = 'service_role'
  or exists (
    select 1
    from public.challenges c
    where c.id = challenge_id
      and public.is_room_member(c.room_id)
  )
);

drop policy if exists challenge_votes_insert_member_before_deadline on public.challenge_votes;
create policy challenge_votes_insert_member_before_deadline
on public.challenge_votes
for insert
with check (
  auth.role() = 'service_role'
  or (
    guest_id::text = public.request_guest_id()
    and exists (
      select 1
      from public.challenges c
      where c.id = challenge_id
        and c.status = 'voting'
        and timezone('utc'::text, now()) < c.voting_deadline
        and public.is_room_member(c.room_id)
    )
  )
);

drop policy if exists challenge_votes_update_own_vote on public.challenge_votes;
create policy challenge_votes_update_own_vote
on public.challenge_votes
for update
using (
  auth.role() = 'service_role'
  or guest_id::text = public.request_guest_id()
)
with check (
  auth.role() = 'service_role'
  or guest_id::text = public.request_guest_id()
);

drop policy if exists challenge_votes_delete_service_role_only on public.challenge_votes;
create policy challenge_votes_delete_service_role_only
on public.challenge_votes
for delete
using (auth.role() = 'service_role');

alter table public.challenges replica identity full;
alter table public.challenge_votes replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.challenges;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.challenge_votes;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;
