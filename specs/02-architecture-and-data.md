# DareBet - Architecture and Data Specification

## 1) Architecture Overview
DareBet uses a Next.js App Router frontend + server routes backed by Supabase (PostgreSQL, Realtime, Storage). External match/odds data is ingested from The Odds API through scheduled jobs.

## 2) Components
- **Web App (Next.js):** room UX, challenge flows, leaderboard, completion actions.
- **Supabase PostgreSQL:** core persistence (`rooms`, `room_members`, `challenges`, `matches_cache`).
- **Supabase Realtime:** push updates to active room clients.
- **Supabase Storage:** (Not used for proof workflow; completion is action-based.)
- **Scheduled Jobs (Vercel Cron):** odds sync and result sync automation.

## 3) Data Model (From PROJECT_SPEC DDL)

### 3.1 `matches_cache`
- Stores odds and score snapshots from external provider.
- Core fields: match identity, teams, commence time, odds, status, scores, updated timestamp.
- Purpose: reduce external API calls and provide a consistent local source of truth.

### 3.2 `rooms`
- Represents private social groups.
- Core fields: room name, 4-digit passcode, creator guest id, created timestamp.

### 3.3 `room_members`
- Maps guest identities to rooms.
- Constraints: unique (`room_id`, `guest_id`) to prevent duplicate joins.

### 3.4 `challenges`
- Stores P2P dares tied to matches.
- Includes challenger/defender ids, picks, punishment, and lifecycle status.

## 4) Suggested Additional Constraints (Implementation Guidance)
- Check constraint for `challenges.challenger_pick` in (`home`, `away`, `draw`).
- Check constraint for `challenges.status` in allowed status enum set.
- Prevent self-challenge (`challenger_id != defender_id`).
- Optional index suggestions:
  - `matches_cache(commence_time, status)`
  - `room_members(room_id)`
  - `challenges(room_id, status)`
  - `challenges(match_id, status)`

## 5) Data Flow

### 5.1 Room and Membership Flow
1. Guest identity initialized in browser.
2. User creates room -> insert into `rooms`.
3. Creator inserted into `room_members`.
4. Joiners validate passcode and insert into `room_members`.

### 5.2 Challenge Flow
1. User selects match + target member + punishment.
2. Backend validates membership and challenge rules.
3. Insert challenge with `pending` state.
4. Defender accepts/rejects; state transitions accordingly.
5. Completed match triggers winner resolution state transition.

### 5.3 Punishment Completion Flow
1. Match result sync moves accepted challenges into `challenger_won` or `defender_won`.
2. Loser clicks "I completed punishment" (`mark_done`) to move challenge to `active`.
3. Winner clicks "Approve completion" (`approve_done`) to move challenge to `completed`.
4. Realtime broadcast updates room participants.

## 6) Realtime Strategy
- Subscribe clients per room channel.
- Broadcast insert/update events for `room_members` and `challenges`.
- Keep UI state eventually consistent with server snapshots.

## 7) Security and Access Pattern (High-Level)
- Apply row-level policies so users only access rooms they belong to.
- Restrict challenge mutation to participants/system jobs according to status.
- Restrict completion actions to winner/loser roles.

## 8) Scalability Notes
- Use cache table and incremental sync windows to protect API quota.
- Avoid broad table subscriptions; subscribe by room scope.
- Add archival policy for old matches and stale completion records in later phases.
