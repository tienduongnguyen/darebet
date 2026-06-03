# DareBet - Frontend UX, App Flows, and PWA Specification

## 1) Purpose
Define mobile-first user experience and app-shell behaviors for the no-login DareBet flow.

## 2) UX Principles
- Minimize friction from first visit to first challenge.
- Prioritize mobile layout and touch interactions.
- Keep room state legible with clear challenge statuses.
- Provide immediate feedback for every user action.

## 3) Core Screens
- **Landing / Identity Setup:** capture or confirm display name.
- **Room Entry:** create room or join room.
- **Room Dashboard:** members, active challenges, match list, leaderboard.
- **Challenge Composer:** select defender, match, pick, and punishment.
- **Challenge Detail:** lifecycle, participants, completion confirmation and approval.

## 4) Navigation Flow
1. Landing -> identity bootstrap.
2. Create or Join room.
3. Enter room dashboard.
4. Create/respond to challenges.
5. View results and confirm completion / approve when needed.

## 5) State and Feedback Requirements
- Loading states for network operations.
- Empty states for rooms with no matches or no challenges.
- Error states for passcode mismatch, failed actions, and stale match data.
- Toasts or inline confirmation for successful challenge actions.

## 6) Responsive Design Standards
- Use strict mobile-first implementation; define default styles for mobile, then extend with larger breakpoints.
- Use standard Tailwind breakpoints only: `sm` (640), `md` (768), `lg` (1024), `xl` (1280), `2xl` (1536).
- Prefer fluid layout patterns (`w-full`, `max-w-*`, responsive grid/flex) over fixed-width containers.
- Require minimum touch targets of 44x44px for interactive controls.
- Require readable typography on mobile: body text >= 1rem, small text >= 0.875rem where applicable.
- Prevent horizontal overflow and overlapping/truncated critical content across supported breakpoints.
- Use responsive image delivery with Next.js `Image` and `sizes` to match viewport behavior.

## 7) PWA Requirements (V1-Ready)
- Web manifest with app name/icons/theme metadata.
- Installable behavior on supported browsers.
- Basic offline shell support for non-critical screens (future enhancement if needed).

## 8) Accessibility Requirements
- Semantic structure and keyboard-accessible controls.
- Sufficient color contrast for dark sports-themed UI.
- Visible focus indicators and readable text sizes on mobile.

## 9) Performance Targets
- Room screen first meaningful paint should be fast on mid-tier mobile devices.
- Keep realtime updates lightweight and avoid full-screen re-renders.
- Defer heavy media loading where possible.

## 10) Acceptance Criteria
- A new user can reach room dashboard from first visit in under one minute.
- Room interactions remain usable on common mobile viewport sizes.
- Challenge actions present clear state transitions and outcomes.
- App can be installed as a PWA on supported platforms.
- Responsive checks pass at 375px, 414px, 768px, 1024px, and 1440px viewports.
