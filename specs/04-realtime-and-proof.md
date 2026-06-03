# DareBet - Realtime and Completion Management Specification

## 1) Purpose
Define event-driven room updates and punishment completion handling for challenge resolution workflows.

## 2) Realtime Event Domains
- **Room Membership Events:** member joined.
- **Challenge Events:** created, accepted, rejected, resolved, completed.
- **Leaderboard Events:** score/rank recalculation triggers.

## 3) Subscription Strategy
- Scope subscriptions per room identifier to limit noise.
- On client connection:
  1. Fetch initial room snapshot.
  2. Subscribe to realtime room events.
  3. Merge incoming events into local state.
- On reconnect:
  - Re-fetch latest snapshot and reconcile to avoid missed events.

## 4) Leaderboard Behavior
- Leaderboard updates when a challenge reaches resolved/won states.
- Suggested scoring baseline (to validate with product):
  - Win: +1 point.
  - Loss: 0 points.
- Ties in rank sorted by latest win timestamp or deterministic secondary key.

## 5) Punishment Completion Flow
1. Match result sync moves accepted challenges into `challenger_won` or `defender_won`.
2. Loser clicks "I completed punishment" (`mark_done`) to move challenge to `active`.
3. Winner clicks "Approve completion" (`approve_done`) to move challenge to `completed`.
4. Broadcast update via realtime to room participants.

## 6) Completion Policy
- Only the loser can mark punishment as completed.
- Only the winner can approve the completion.
- Completion actions are restricted to involved challenge users.
- Room members see status changes after each step.

## 7) Abuse and Safety Considerations
- Rate-limit repeated completion action attempts.
- Keep audit logs for completion actor and timestamp.
- Prevent winner from skipping loser confirmation (status guardrails).

## 8) Acceptance Criteria
- Room members see challenge status updates in near real time.
- Leaderboard reflects resolved challenges without manual refresh.
- Completion actions succeed only for authorized winner/loser roles.
- Unauthorized users cannot trigger or overwrite completion state.
