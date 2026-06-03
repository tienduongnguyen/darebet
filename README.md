# DareBet

DareBet is a no-login, room-based World Cup challenge platform built with Next.js App Router and Supabase. Guests are identified by a `localStorage` UUID and join rooms via a 4-digit passcode. The Odds API acts as the automated referee that settles challenges.

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project
- A The Odds API key

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill required values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ODDS_API_KEY`
- `ODDS_API_BASE_URL` (e.g. `https://api.the-odds-api.com/v4`)
- `SUPABASE_JWT_SECRET` (optional; enables authenticated Realtime — without it, clients fall back to polling)

4. Start development server:

```bash
npm run dev
```

## Database Migrations

Source of truth for the schema lives in `supabase/migrations/`:

- `20260602111500_phase1_foundation.sql` — core tables (`matches_cache`, `rooms`, `room_members`, `challenges`), constraints, indexes, and RLS policies.
- `20260602190000_phase2_group_vote_challenges.sql` — group-vote challenge model (`challenges` + `challenge_votes`).

Apply migrations through one of these options:

1. Supabase SQL Editor (paste and execute each migration in order).
2. Supabase CLI (`supabase db push`) if your project is linked.

## Match Data Sync (on-demand)

There is **no cron**. Match odds and results are refreshed on demand when a user
opens a room or taps **Refresh**:

- `POST /api/sync` → fetches odds + results from The Odds API, upserts `matches_cache`, and settles any challenges whose match has finished.

The endpoint is **throttled server-side** (60s cooldown keyed on the freshest
cache row), so repeated taps from a group collapse into at most one live Odds API
call per window — protecting the limited API quota. Odds and result writes own
disjoint columns, so they never overwrite each other.

## API Routes

- `GET /api/matches` — upcoming match feed
- `GET /api/matches/voted` — upcoming matches the guest has voted on
- `POST /api/sync` — on-demand odds/result refresh (throttled)
- `POST /api/realtime-token` — mint a per-guest Realtime JWT
- `GET /api/rooms?guestId=...` — list a guest's rooms
- `POST /api/rooms` — create a room
- `POST /api/rooms/join` — join a room by passcode
- `GET /api/rooms/:roomId/members?guestId=...`
- `GET /api/rooms/:roomId/leaderboard?guestId=...`
- `GET /api/rooms/:roomId/challenges?guestId=...`
- `POST /api/rooms/:roomId/challenges` — host creates a challenge on a match
- `POST /api/rooms/:roomId/challenges/:challengeId/vote` — cast a vote (`home` / `away`)
- `PATCH /api/rooms/:roomId/challenges/:challengeId/completion` — losing voter marks their punishment done

## Challenge Flow (group vote)

1. The room **host** creates a challenge on an upcoming match with a `punishment`
   and a `voting_deadline`.
2. Room **members vote** `home` or `away` before the deadline (voting locks shortly
   before kickoff).
3. When the match finishes, `POST /api/sync` reads the score and settles the
   challenge into `home_won`, `away_won`, or `draw`.
4. Voters on the **losing** side must perform the punishment; each marks it done
   via the completion endpoint (`punishment_done`). A `draw` voids the challenge.

## Deployment (Vercel)

1. Push to a Git repository and import it in Vercel (framework auto-detected as Next.js).
2. Set the environment variables listed above (Production + Preview). `CRON_SECRET`
   is **not** required — there is no cron.
3. Apply the Supabase migrations to your production database before going live.
