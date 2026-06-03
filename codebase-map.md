# Codebase Map — DareBet

> Authoritative structural map. Read THIS instead of globbing/grepping the tree.
> Update this file whenever folders, services, or routes are added/moved/removed.

## What it is
Mobile-first PWA for zero-money P2P "dare betting" during the World Cup. No login —
guest identity via `localStorage` UUID. Rooms joined by 4-digit passcode. The Odds API
acts as automated referee. Stack: **Next.js 16 App Router + TS, TailwindCSS v4 + DaisyUI,
Supabase (Postgres + Realtime)**. Match data refreshes on-demand via `POST /api/sync`
(user-triggered, server-side throttled) — no cron. Full product spec: `PROJECT_SPEC.md`.

## Top-level layout
- `app/` — Next.js App Router (routes, API handlers, RSC pages, client components)
- `lib/` — all non-route logic, split by execution context (see below)
- `supabase/migrations/` — Postgres DDL (source of truth for schema)
- `specs/`, `tasks/` — planning docs & delivery roadmap (`tasks/00-delivery-roadmap.md`)
- `PROJECT_SPEC.md` — product + DB schema spec

## `lib/` — organized by execution boundary (IMPORTANT)
- `lib/domain/` — **pure** logic, no I/O. `odds.ts` (odds→%), `leaderboard.ts`, `country-flags.ts`
- `lib/server/` — server-only services & I/O. NEVER import from client.
  - `challenges-service.ts` — challenges CRUD, voting, punishment, match feed (largest file)
  - `rooms-service.ts` — create/join room, list rooms & members for a guest
  - `sync-service.ts` — `runOddsSync` / `runResultSync`, plus `runOnDemandSync` (60s-cooldown wrapper called on user refresh). Odds & result writes own disjoint columns so they never clobber each other.
  - `odds-api.ts` — The Odds API client (`fetchOddsSnapshot`, `fetchResultSnapshot`)
  - `supabase-rest.ts` — `supabaseRest<T>()` REST helper + `SupabaseRestError`
  - `realtime-token.ts` — `mintRealtimeToken()` per-guest JWT (see memory: realtime-auth-design)
  - `proof-service.ts` — proof workflow (note: proof upload deprecated, see spec)
  - `moderation-service.ts` — `moderatePunishment()` LLM content filter (OpenAI) blocking gambling/NSFW/gore/illegal dares. Fail-open: skipped when `OPENAI_API_KEY` unset or on API error. Called by `createChallenge`.
- `lib/browser/supabase-client.ts` — `getBrowserSupabaseClient()` singleton (client-side)
- `lib/hooks/` — client React hooks: `use-guest-identity.ts`, `use-room-realtime.ts`
- `lib/i18n/` — client i18n (no dependency). `messages.ts` (EN/VI dictionary; `en` is the `MessageKey` source of truth, `vi` is type-enforced to match), `context.tsx` (`LanguageProvider` + `useI18n()` → `{ locale, setLocale, t, formatDateTime }`; locale in `localStorage` `darebet_locale`, auto-detected from `navigator.language` on first visit)
- `lib/env/` — env validation: `public.ts` (`publicEnv`), `server.ts` (`serverEnv`)
- `lib/types/domain.ts` — DB entity types & unions (`RoomEntity`, `ChallengeEntity`, `MatchStatus`, `VotePick`…)
- `lib/validation/common.ts` — `isUuid`, `isValidPasscode`, `isVotePick`, `sanitizeText`, `PASSCODE_PATTERN`
- `lib/utils/clipboard.ts` — `copyTextToClipboard()`

## `app/` — routes & pages
- `app/page.tsx` + `app/_components/home-entry.tsx` — home (create/join room)
- `app/rooms/[roomId]/page.tsx` + `app/_components/room-dashboard.tsx` — room dashboard (client; has Back link to `/`)
- `app/_components/app-providers.tsx` — client wrapper (`LanguageProvider` + `LanguageSwitcher`), mounted in `layout.tsx`
- `app/_components/language-switcher.tsx` — fixed top-right VI/EN toggle
- `app/layout.tsx`, `manifest.ts`, `globals.css`, icons — shell & PWA

### API routes (`app/api/`) — handler → service it calls
- `matches/route.ts` GET, `matches/voted/route.ts` GET → `challenges-service` (`getMatchFeed`, `listVotedUpcomingMatches`)
- `realtime-token/route.ts` POST → `realtime-token` (`mintRealtimeToken`)
- `rooms/route.ts` GET+POST, `rooms/join/route.ts` POST → `rooms-service`
- `rooms/[roomId]/members` GET, `.../leaderboard` GET → `rooms-service` + `domain/leaderboard`
- `rooms/[roomId]/challenges` GET+POST → `challenges-service` (`listRoomChallenges`, `createChallenge`)
- `rooms/[roomId]/challenges/[challengeId]/vote` POST → `castChallengeVote`
- `rooms/[roomId]/challenges/[challengeId]/completion` PATCH → `markPunishmentDone`
- `rooms/[roomId]/challenges/[challengeId]/proof` GET+POST → `proof-service` (deprecated)
- `sync/route.ts` POST → `sync-service` (`runOnDemandSync`) — user-triggered, throttled refresh of odds + results (replaces cron)

## Conventions
- Routes are thin: parse/validate → call a `lib/server` service → shape JSON. Business logic lives in services, NOT routes.
- Pure calculations go in `lib/domain` and must stay I/O-free (so they're unit-testable).
- Server services talk to Supabase via `supabaseRest` (REST), not the JS client.
- Service errors use typed error classes (`RoomServiceError`, `ChallengeServiceError`) with a `code` field.
- Validate all external input through `lib/validation/common.ts` helpers.
- Schema changes = a new file in `supabase/migrations/` (never edit old migrations).
- User-facing copy = add a key to BOTH `en`/`vi` in `lib/i18n/messages.ts` and render via `useI18n().t(key, params)`; never hardcode display strings in components. Format dates with `formatDateTime` (locale-aware), not `toLocaleString()`.
