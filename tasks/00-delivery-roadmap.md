# DareBet - Delivery Roadmap (Task Breakdown)

## Goal
Deliver V1 scope defined in `specs/` with a phased, dependency-aware implementation plan.

## Phase 1 - Foundation and Data
**Objective:** establish project baseline, schema, policies, and server primitives.

- [x] T1.1 Configure environment variables for Supabase and Odds API.
- [x] T1.2 Create and apply PostgreSQL schema from project DDL. (Both migrations applied manually via Supabase SQL Editor.)
- [x] T1.3 Add DB constraints/indexes from data spec guidance.
- [x] T1.4 Define Supabase RLS policies for rooms, memberships, challenges, and proof references.
- [x] T1.5 Scaffold shared TypeScript types for DB entities and challenge statuses.

**Exit Criteria**
- Database and policies are deployable and validated in dev.
- App can read/write core entities through secure server boundaries.

## Phase 2 - Identity, Rooms, and Membership
**Objective:** deliver no-login room lifecycle.

- [x] T2.1 Implement client guest identity bootstrap (`guest_id`, `display_name`).
- [x] T2.2 Build "create room" flow and API route/server action.
- [x] T2.3 Build "join room" flow with passcode validation.
- [x] T2.4 Build room dashboard shell with member list.
- [x] T2.5 Implement clear UX errors for invalid passcodes and duplicate joins.

**Exit Criteria**
- Users can create/join rooms and see synchronized member roster.

## Phase 3 - Match Feed and Challenge Lifecycle
**Objective:** enable dare creation and participant decisions.

- [x] T3.1 Build match feed endpoint from `matches_cache`.
- [x] T3.2 Implement challenge composer UI and submission validation.
- [x] T3.3 Implement challenge creation backend with membership checks.
- [x] T3.4 Implement defender accept/reject actions and status transitions.
- [x] T3.5 Build challenge list/details on room dashboard.

**Exit Criteria**
- Valid challenges move from pending to accepted/rejected through controlled transitions.

## Phase 4 - Odds Sync and Automatic Resolution
**Objective:** automate source-of-truth updates and winner resolution.

- [x] T4.1 Implement hourly odds sync cron job.
- [x] T4.2 Implement result sync job for completed matches.
- [x] T4.3 Implement deterministic challenge resolution service.
- [x] T4.4 Make resolution idempotent and safe for retries.
- [ ] T4.5 Add logging/metrics for sync lag, failures, and quota usage. (Structured logs and quota usage included; sync-lag/failure metrics dashboards pending.)

**Exit Criteria**
- Completed matches reliably trigger correct challenge outcomes.

## Phase 5 - Realtime, Leaderboard, and Punishment Completion
**Objective:** deliver live room behavior and winner/loser completion workflow.

- [x] T5.1 Subscribe room clients to realtime challenge/member changes. (Supabase Realtime channel `room:{id}` on `room_members`/`challenges`/`challenge_votes`, authenticated via per-guest JWT.)
- [x] T5.2 Implement incremental UI reconciliation on realtime events. (Events coalesced into a debounced silent refetch so joins/leaderboard stay correct; polling fallback when realtime is unconfigured.)
- [x] T5.3 Build leaderboard calculation and display logic.
- [x] T5.4 Implement loser "mark done" completion action.
- [x] T5.5 Implement winner approval action with role-based authorization.

**Exit Criteria**
- Room participants receive live updates and can complete/approve punishment flow.

## Phase 6 - UX Polish, Responsive Compliance, and Release Readiness
**Objective:** finalize quality, responsive usability, and operational readiness.

- [ ] T6.1 Add complete loading/empty/error UI states.
- [x] T6.2 Add PWA manifest/icons and installability checks. (App Router `manifest.ts`, brand icons incl. maskable, theme-color/apple-web-app metadata; verified in prod build. On-device install QA pending deployed HTTPS instance.)
- [ ] T6.3 Validate responsive behavior at 375, 414, 768, 1024, and 1440 widths.
- [x] T6.4 Audit touch targets and typography readability on mobile-first views. (Enforced >=44px hit area for all buttons/inputs via `globals.css` floor; raised informational small text from 0.75rem to >=0.875rem. See H3/H4.)
- [ ] T6.5 Add runbooks for quota exhaustion and sync failures.
- [ ] T6.6 Execute full pre-release checklist and bug triage.

**Exit Criteria**
- V1 is deployable, usable on mobile, and operationally supportable.
- Responsive quality gates pass with no blocking layout issues across required viewports.
