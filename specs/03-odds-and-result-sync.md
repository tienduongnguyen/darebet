# DareBet - Odds API Integration and Sync Specification

## 1) Purpose
Define reliable, quota-aware ingestion of match schedules, odds, and final results from The Odds API.

## 2) External Dependency
- Provider: The Odds API (free tier quota: 500 requests/month).
- Sync must be server-side only.
- Client must not call provider directly.

## 3) Sync Jobs

### JOB-001 Hourly Odds Sync
- Trigger cadence: hourly.
- Scope: upcoming and live World Cup matches.
- Upsert records into `matches_cache`.

### JOB-002 Post-Match Result Sync
- Trigger cadence: frequent polling window around match end (or periodic pass).
- Scope: matches transitioning to `completed`.
- Update scores and final status in `matches_cache`.
- Trigger challenge resolution logic for dependent challenges.

## 4) Quota Optimization Rules
- Prefer incremental fetch by time range and status.
- Avoid re-fetching immutable completed matches repeatedly.
- Track request count and enforce monthly budget guards.
- Introduce graceful degradation near quota limit (reduced frequency, priority filtering).

## 5) Mapping Rules
- External match id -> `matches_cache.id`.
- Team names and commence time map directly.
- Odds map to `home_odds`, `away_odds`, `draw_odds`.
- Result scores map to `home_score`, `away_score`.
- External state maps to internal `status` (`uncommenced`, `live`, `completed`).

## 6) Challenge Resolution Rules
- Determine actual outcome from final scores:
  - Home score > away score -> outcome `home`.
  - Away score > home score -> outcome `away`.
  - Equal scores -> outcome `draw`.
- Compare outcome against `challenger_pick` and `defender_pick`.
- Set challenge status to `challenger_won` or `defender_won`.
- Resolution must be idempotent (safe to re-run without changing finalized result unexpectedly).

## 7) Failure Handling
- Retry transient provider/network failures with exponential backoff.
- Persist sync errors and metrics for observability.
- Preserve previous cache values when current provider payload is incomplete.
- Alert when sync lag exceeds acceptable threshold.

## 8) Acceptance Criteria
- Match cache stays current for active competition window.
- Completed match status and scores are propagated to cache reliably.
- Dependent challenges resolve correctly after completion sync.
- API usage remains within monthly quota under expected room/challenge load.
