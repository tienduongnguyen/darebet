# DareBet - Testing and Release Checklist

## 1) Functional Verification
- [ ] New user can initialize guest identity.
- [ ] User can create and join a room with valid passcode.
- [ ] Invalid passcode blocks entry with clear feedback.
- [ ] User can create challenge against valid defender.
- [ ] Defender can accept or reject pending challenge.
- [ ] Completed match resolves challenge winner correctly.
- [ ] Loser can mark punishment completion and move challenge to `active`.
- [ ] Winner can approve completion and move challenge to `completed`.

## 2) Realtime Verification
- [ ] Member joins appear live for connected users.
- [ ] Challenge state changes propagate without manual refresh.
- [ ] Leaderboard updates after resolution events.
- [ ] Reconnect restores room state after brief disconnection.

## 3) Sync and Automation Verification
- [ ] Hourly odds sync updates cache records as expected.
- [ ] Result sync transitions matches to completed with scores.
- [ ] Challenge resolution job is idempotent when rerun.
- [ ] API quota safeguards activate near usage thresholds.

## 4) Security and Policy Verification
- [ ] Non-members cannot read/write room-specific challenge data.
- [ ] Unauthorized users cannot trigger completion actions.
- [ ] Server-side validation rejects malformed or out-of-state actions.

## 5) UX and Performance Verification
- [ ] Core mobile flows are usable on common viewport sizes.
- [ ] Loading/empty/error states are present for critical pages.
- [ ] Realtime latency target (P95 <= 2s) is measured and acceptable.
- [ ] Responsive layout passes viewport checks at 375px, 414px, 768px, 1024px, and 1440px.
- [ ] No horizontal scrolling appears on supported mobile breakpoints.
- [ ] No critical content overlap/truncation appears during responsive transitions.
- [ ] Interactive controls meet minimum touch target size (44x44px).
- [ ] Mobile typography remains readable (body >= 1rem, small text >= 0.875rem where applicable).
- [ ] Responsive image rendering is validated with appropriate Next.js `Image` sizing.

## 6) Release Readiness
- [ ] Environment variables are set for production.
- [ ] Cron schedules are configured and enabled.
- [ ] Logging/monitoring dashboards are available.
- [ ] Runbook for sync failure and quota exhaustion is documented.
