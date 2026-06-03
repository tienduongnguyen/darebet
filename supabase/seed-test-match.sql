-- Comprehensive test data seed for DareBet
-- Scenarios: upcoming match, live match (mid-game score), completed match (resolved challenge)
-- Teams: Portugal (home) vs Argentina (away)

DO $$
DECLARE
  -- Fixed guest IDs (valid v4-like strings; Postgres bypasses RLS in SQL Editor)
  v_host_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  v_alice_id uuid := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
  v_bob_id uuid := 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

  v_room_id uuid := gen_random_uuid();

  v_match_upcoming text := 'test_por_arg_upcoming';
  v_match_live text := 'test_por_arg_live';
  v_match_done text := 'test_por_arg_done';

  v_challenge1 uuid := gen_random_uuid();
  v_challenge2 uuid := gen_random_uuid();
  v_challenge3 uuid := gen_random_uuid();

  v_now timestamptz := timezone('utc'::text, now());
  v_kickoff_upcoming timestamptz := '2026-06-03T09:15:00+00:00'::timestamptz;
  v_kickoff_live timestamptz := v_now - interval '40 minutes';
  v_kickoff_done timestamptz := v_now - interval '1 day';
BEGIN
  -- Clean up previous test data (reverse dependency order)
  DELETE FROM public.challenge_votes
  WHERE challenge_id IN (
    SELECT id FROM public.challenges WHERE room_id = v_room_id
  );
  DELETE FROM public.challenges WHERE room_id = v_room_id;
  DELETE FROM public.room_members WHERE room_id = v_room_id;
  DELETE FROM public.rooms WHERE id = v_room_id;
  DELETE FROM public.matches_cache WHERE id LIKE 'test_por_arg_%';

  -- 1) MATCHES
  INSERT INTO public.matches_cache (
    id, sport_key, home_team, away_team, commence_time,
    home_odds, away_odds, draw_odds, status, home_score, away_score
  ) VALUES
    -- Upcoming (voting open until 10 min before kickoff)
    (v_match_upcoming, 'soccer_fifa_world_cup', 'Portugal', 'Argentina',
     v_kickoff_upcoming,
     round((1.5 + random() * 3)::numeric, 2),
     round((1.5 + random() * 3)::numeric, 2),
     round((2.5 + random() * 2)::numeric, 2),
     'uncommenced', null, null),

    -- Live (kickoff 40m ago, mid-game score 1-1)
    (v_match_live, 'soccer_fifa_world_cup', 'Portugal', 'Argentina',
     v_kickoff_live,
     round((1.5 + random() * 3)::numeric, 2),
     round((1.5 + random() * 3)::numeric, 2),
     round((2.5 + random() * 2)::numeric, 2),
     'live', 1, 1),

    -- Completed (yesterday, Portugal won 2-1)
    (v_match_done, 'soccer_fifa_world_cup', 'Portugal', 'Argentina',
     v_kickoff_done,
     round((1.5 + random() * 3)::numeric, 2),
     round((1.5 + random() * 3)::numeric, 2),
     round((2.5 + random() * 2)::numeric, 2),
     'completed', 2, 1);

  -- 2) ROOM
  INSERT INTO public.rooms (id, room_name, passcode, created_by)
  VALUES (v_room_id, 'Test Room', '1234', v_host_id);

  -- 3) MEMBERS
  INSERT INTO public.room_members (room_id, guest_id, display_name) VALUES
    (v_room_id, v_host_id, 'Anh Duong'),
    (v_room_id, v_alice_id, 'Alice'),
    (v_room_id, v_bob_id, 'Bob');

  -- 4) CHALLENGES
  INSERT INTO public.challenges (
    id, room_id, match_id, created_by, punishment, voting_deadline, status
  ) VALUES
    -- Upcoming: still voting
    (v_challenge1, v_room_id, v_match_upcoming, v_host_id,
     'Do 20 push-ups', v_kickoff_upcoming - interval '10 minutes', 'voting'),

    -- Live: voting locked (deadline passed) but not yet resolved
    (v_challenge2, v_room_id, v_match_live, v_host_id,
     'Buy milk tea for the room', v_kickoff_live - interval '10 minutes', 'voting'),

    -- Completed: resolved, home won
    (v_challenge3, v_room_id, v_match_done, v_host_id,
     'Sing a song in voice chat', v_kickoff_done - interval '10 minutes', 'home_won');

  -- 5) CHALLENGE VOTES
  INSERT INTO public.challenge_votes (challenge_id, guest_id, pick, punishment_done) VALUES
    -- Challenge 1 (upcoming)
    (v_challenge1, v_host_id, 'home', false),
    (v_challenge1, v_alice_id, 'away', false),
    (v_challenge1, v_bob_id, 'home', false),

    -- Challenge 2 (live)
    (v_challenge2, v_host_id, 'home', false),
    (v_challenge2, v_alice_id, 'home', false),
    (v_challenge2, v_bob_id, 'away', false),

    -- Challenge 3 (completed, home won 2-1)
    -- home pick = winners, away pick = losers (punishment_done = true)
    (v_challenge3, v_host_id, 'home', false),
    (v_challenge3, v_alice_id, 'away', true),
    (v_challenge3, v_bob_id, 'home', false);
END $$;
