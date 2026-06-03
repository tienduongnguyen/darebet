# DareBet - Frontend and UX Tasks

## Epic A - App Shell and Identity
- [x] A1 Build initial app shell and route structure (App Router).
- [x] A2 Implement guest bootstrap hook/utility for `guest_id` and `display_name`.
- [x] A3 Build identity prompt and persistence UX.

## Epic B - Room Entry Experience
- [x] B1 Implement create-room form and success flow.
- [x] B2 Implement join-room form with room identifier + passcode.
- [x] B3 Add robust validation messages and retry affordances.
- [ ] B4 Add deep-link handling for direct room entry (optional enhancement).

## Epic C - Room Dashboard
- [x] C1 Build members panel with live updates.
- [x] C2 Build match list panel with status and odds.
- [x] C3 Build challenge feed panel with status badges.
- [x] C4 Build leaderboard panel and sorting behavior.

## Epic D - Challenge Interaction
- [x] D1 Build challenge composer modal/page.
- [x] D2 Add defender selector and match selector UX.
- [x] D3 Add punishment input with length validation.
- [x] D4 Add accept/reject controls for defenders.
- [x] D5 Add challenge detail view with punishment completion section.

## Epic E - Realtime UX
- [x] E1 Subscribe to room-level realtime channel. (`useRoomRealtime` hook + browser Supabase client.)
- [x] E2 Merge realtime events into client state safely. (Debounced silent refetch preserves UI/scroll/form state and authoritative joins.)
- [x] E3 Implement reconnect + resync UX for disconnected sessions. (Connection-status badge, reconnect banner, resync on re-subscribe / `online` / tab-refocus, polling fallback.)

## Epic F - Punishment Completion UX
- [x] F1 Add loser "I completed punishment" action state.
- [x] F2 Add winner approval action state.
- [x] F3 Show clear waiting/approved completion messages.

## Epic G - PWA and Quality
- [x] G1 Configure manifest and app icons. (`app/manifest.ts` → `/manifest.webmanifest`; brand soccer-ball PNG icons 192/512 + maskable 512 in `public/`, `app/apple-icon.png` 180, `app/icon.png` 32; `theme-color`/`viewport-fit=cover`/`appleWebApp` set in `app/layout.tsx`.)
- [x] G2 Validate installability on mobile browsers. (Installability criteria met and verified in prod build: valid manifest served as `application/manifest+json`, `display: standalone`, 192 + 512 + maskable icons, head link tags emitted. On-device install QA still needs a deployed HTTPS instance + real handset.)
- [ ] G3 Add loading, empty, and error states for all major views.
- [ ] G4 Perform accessibility pass (focus states, semantics, contrast).

## Epic H - Responsive Compliance
- [ ] H1 Enforce mobile-first class strategy across all pages/components.
- [ ] H2 Standardize responsive layout behavior using Tailwind breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`).
- [x] H3 Audit and fix touch target sizing (minimum 44x44px for buttons and interactive controls). (daisyUI defaults were 40/32/24px; added a `globals.css` floor — `.btn/.input/.select/.textarea { min-height: 2.75rem }` plus `.btn { min-width: 2.75rem }` — so every control meets 44px on all breakpoints.)
- [x] H4 Audit typography scale and readability (body >= 1rem, small text >= 0.875rem where applicable). (Raised informational `text-xs` (0.75rem) metadata/labels to `text-sm` (0.875rem) across home + dashboard; kept `badge-*` chrome and decorative uppercase eyebrow labels as the "where applicable" carve-out.)
- [ ] H5 Validate fluid containers and remove fixed-width patterns causing overflow.
- [ ] H6 Add responsive image sizing rules with Next.js `Image` `sizes` attributes.
- [ ] H7 Run viewport QA matrix at 375, 414, 768, 1024, and 1440 widths.
