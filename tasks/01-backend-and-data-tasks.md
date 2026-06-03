# DareBet - Backend and Data Tasks

## Epic A - Schema and Persistence
- [x] A1 Convert provided SQL DDL into migration files.
- [x] A2 Add missing constraints for pick/status validity.
- [x] A3 Add indexes for room, match, and challenge query hotspots.
- [ ] A4 Validate migration rollback strategy in local/dev. (Pending DB-connected dry-run/rollback verification.)

## Epic B - Access Control and Security
- [x] B1 Define RLS policy matrix by table and actor.
- [x] B2 Implement policies for room-scoped reads/writes.
- [x] B3 Restrict challenge mutations by participant role and lifecycle state.
- [x] B4 Restrict proof URL mutation to authorized challenge actors.

## Epic C - API Surface (Server Actions or Route Handlers)
- [x] C1 Create room endpoint/action.
- [x] C2 Join room endpoint/action with passcode checks.
- [x] C3 List room members endpoint/action.
- [x] C4 Create challenge endpoint/action with domain validation.
- [x] C5 Accept/reject challenge endpoint/action.
- [x] C6 List room challenges endpoint/action.

## Epic D - Sync Jobs and Automation
- [x] D1 Implement Odds API client with typed response mapping.
- [x] D2 Implement hourly odds sync upsert service.
- [x] D3 Implement post-match result sync service.
- [x] D4 Implement challenge resolution processor.
- [ ] D5 Add idempotency guardrails and retry logic. (Idempotent resolution guards implemented; retry/backoff policy pending.)

## Epic E - Punishment Completion Workflow
- [x] E1 Add loser completion action endpoint/service.
- [x] E2 Add winner approval endpoint/service.
- [x] E3 Enforce role-based completion authorization (loser vs winner).
- [x] E4 Emit room update events for completion transitions. (`punishment_done` on `challenge_votes` has replica identity full and is in the `supabase_realtime` publication, so completion changes replicate to room clients; `/api/realtime-token` mints the per-guest JWT that lets RLS deliver them.)

## Epic F - Observability
- [ ] F1 Add structured logs for challenge lifecycle events.
- [ ] F2 Add sync metrics (latency, failures, quota usage).
- [ ] F3 Add error taxonomy for API and automation layers.
