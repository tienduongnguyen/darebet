# DareBet - Overview Analysis (Detailed from PROJECT_SPEC)

## 1) Product Goal
- Build a peer-to-peer web app where friends bet with real-life dares during the World Cup.
- Do not use real money; winners and losers are determined by match outcomes and selected picks.
- Remove login friction by letting users create/join rooms quickly with a 4-digit passcode.

## 2) Core Value Proposition
- **Fast:** users can enter a room and create a challenge in seconds.
- **Fun:** punishments (dares) create social entertainment instead of financial stakes.
- **Fair:** The Odds API and automated result sync act as a neutral referee.
- **Live:** room activity, challenge updates, and leaderboard changes happen in real time.

## 3) V1 Scope (In Scope)
- Guest identity management via UUID in `localStorage`.
- Room creation, room joining, and member list display.
- Match schedule and odds display from database cache (source: The Odds API).
- 1v1 challenge creation tied to a selected match.
- Defender accept/reject flow.
- Automatic challenge result resolution after match completion.
- Punishment completion confirmation (loser marks done) and winner approval.
- Realtime room leaderboard updates.

## 4) V1 Non-Goals (Out of Scope)
- Account registration/login (email, social login, OTP).
- Real-money betting, wallets, or payment processing.
- Advanced moderation systems (full reporting queues, AI moderation).
- Full multi-sport expansion beyond initial World Cup context.

## 5) Assumptions and Constraints
- Users accept guest identity limitations (identity may be lost if browser storage is cleared).
- The Odds API free tier is limited to 500 requests/month, so cache and sync strategy are mandatory.
- The app is mobile-first and should remain compatible with PWA behavior.
- Realtime capabilities rely on Supabase Realtime (no custom socket infrastructure).
- Frontend implementation must follow responsive standards: mobile-first breakpoints, fluid layouts, touch-friendly controls, and readable typography.

## 6) V1 Success Metrics
- Room creation success rate >= 98%.
- Challenge creation success rate >= 95%.
- Realtime room update latency (P95) <= 2 seconds.
- Match result sync accuracy within <= 10 minutes after a match is completed.
- Completion action success rate >= 95%.
- Responsive QA pass rate = 100% for required viewports (375, 414, 768, 1024, 1440).

## 7) Key Risks to Handle Early
- **API quota exhaustion:** requires request-budget planning and priority-based syncing.
- **Fragile guest identity:** requires UX safeguards and clear user expectations.
- **4-digit passcode collisions:** requires validation strategy to avoid wrong-room entry.
- **Completion state consistency:** requires role-based guards and status transition validation.
- **Result disputes:** requires deterministic winner resolution rules for home/away/draw picks.
- **Responsive regressions:** requires viewport QA gates to prevent overflow, overlap, and unreadable controls.

## 8) Open Questions Before Implementation
- Can the same user create multiple challenges for the same match against the same defender?
- Is loser confirmation required before winner approval?
- Can a challenge be edited after the defender has accepted it?
- Is there a completion deadline for dares (for example, 48 hours after match end)?
