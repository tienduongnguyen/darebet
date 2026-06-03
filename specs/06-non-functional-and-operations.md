# DareBet - Non-Functional Requirements and Operations Specification

## 1) Purpose
Capture quality attributes, observability, deployment, and operational guardrails for V1.

## 2) Reliability
- Core room and challenge actions should be resilient to transient failures.
- Sync jobs should be retryable and idempotent.
- Realtime clients should recover from reconnect scenarios.

## 3) Performance
- Realtime event propagation target: P95 <= 2 seconds.
- Room-level queries should remain efficient under expected fan-out.
- Match sync job duration should stay within scheduled execution windows.

## 3.1) Responsive Quality Attributes
- Mobile-first rendering is required for all core product flows.
- No horizontal overflow is allowed on required mobile viewports.
- Touch controls must remain comfortably usable on handheld devices (minimum 44x44px target).
- Typography must preserve readability baselines across breakpoints.

## 4) Security and Privacy
- No sensitive auth credentials exposed to client.
- Apply principle of least privilege via Supabase policies.
- Store only necessary guest profile data (`guest_id`, `display_name`).
- Validate all user input on server boundaries.

## 5) Observability
- Log structured events for:
  - Room create/join attempts.
  - Challenge lifecycle transitions.
  - Completion action outcomes.
  - Odds/result sync successes and failures.
- Monitor error rate, sync lag, and quota consumption.

## 6) Deployment and Environment
- Hosting target: Vercel (web + cron jobs).
- Managed backend: Supabase project.
- Required environment variables:
  - Supabase URL and keys.
  - The Odds API key.
  - (No storage bucket required for completion workflow.)

## 7) Data Retention Considerations
- Define retention for old completed challenges and completion state history.
- Provide a future archival strategy for historical match data.

## 8) Operational Runbooks (V1)
- API quota near exhaustion: reduce sync frequency + prioritize active matches.
- Sync job failures: inspect logs, rerun safe idempotent backfill job.
- Completion state inconsistency: inspect role-based guard violations and revalidate transitions.

## 9) Acceptance Criteria
- Production deployment supports stable room/challenge lifecycle.
- On-call operator can diagnose failed sync or action incidents via logs.
- Quota safeguards prevent prolonged service degradation.
- Responsive QA gates pass at 375px, 414px, 768px, 1024px, and 1440px.
- No blocking responsive defects (overflow, overlap, unreadable controls) remain at release.
