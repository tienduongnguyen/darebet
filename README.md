# DareBet

DareBet is a no-login, room-based World Cup challenge platform built with Next.js App Router and Supabase.

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project

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
- `ODDS_API_BASE_URL`
- `CRON_SECRET` (optional, recommended for protecting cron endpoints)

4. Start development server:

```bash
npm run dev
```

## Database Migration (Phase 1)

- Migration path: `supabase/migrations/20260602111500_phase1_foundation.sql`
- Includes:
  - Core tables from project DDL (`matches_cache`, `rooms`, `room_members`, `challenges`)
  - Additional constraints and indexes from data spec
  - RLS policies for room/member/challenge access and completion action authorization

Apply migration through one of these options:

1. Supabase SQL Editor (paste and execute migration SQL).
2. Supabase CLI (`supabase db push`) if your local Supabase project is configured.

## Cron Routes (Phase 4)

- `GET /api/cron/odds-sync`
- `GET /api/cron/result-sync`

If `CRON_SECRET` is set, pass it via `x-cron-secret` request header.

## Room APIs Added

- `GET /api/matches`
- `GET /api/rooms/:roomId/challenges?guestId=...`
- `POST /api/rooms/:roomId/challenges`
- `PATCH /api/rooms/:roomId/challenges/:challengeId/response`
- `PATCH /api/rooms/:roomId/challenges/:challengeId/completion` (`action`: `mark_done` or `approve_done`)
- `GET /api/rooms/:roomId/leaderboard?guestId=...`

## Punishment Completion Flow (Current)

- Match result sync moves accepted challenges into `challenger_won` or `defender_won`.
- Loser clicks `I completed punishment` (`action=mark_done`) to move challenge to `active`.
- Winner clicks `Approve completion` (`action=approve_done`) to move challenge to `completed`.

## Challenge Pick Rule (Current)

- Challenger pick `home` -> defender pick auto-assigned to `away`.
- Challenger pick `away` -> defender pick auto-assigned to `home`.
- Challenger pick `draw` -> defender pick currently defaults to `home` (pending explicit product policy).
