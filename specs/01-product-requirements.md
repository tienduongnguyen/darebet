# DareBet - Product Requirements Specification

## 1) Purpose
Define functional product behavior for V1 of DareBet: a no-login, room-based, dare-driven World Cup challenge platform.

## 2) Personas
- **Room Host:** creates a room, invites friends, initiates challenges.
- **Room Member:** joins a room, accepts/rejects challenges, uploads proof.
- **System Referee:** automated services (Odds sync + result resolver) that determine outcomes.

## 3) Functional Requirements

### FR-001 Guest Identity Bootstrap
- On first visit, generate and persist `guest_id` (UUID) in browser `localStorage`.
- Ask user to set `display_name` if missing.
- Reuse existing `guest_id` and `display_name` on returning visits.

**Acceptance Criteria**
- New user can start without account creation.
- Returning user identity remains stable unless browser storage is cleared.

### FR-002 Room Creation
- User can create a room with `room_name` and a 4-digit `passcode`.
- Creator is automatically added to room members.

**Acceptance Criteria**
- Room is persisted with unique `id`.
- Creator appears in member list immediately.

### FR-003 Room Join
- User can join existing room by room identifier and passcode.
- Prevent duplicate membership by (`room_id`, `guest_id`) uniqueness.

**Acceptance Criteria**
- Correct passcode joins successfully.
- Wrong passcode returns a clear error.

### FR-004 Match Feed and Odds
- Show upcoming/relevant World Cup matches from `matches_cache`.
- Display home/away/draw odds and kickoff time.

**Acceptance Criteria**
- Match list loads from database cache without directly calling Odds API from client.
- Match status reflects latest synced value (`uncommenced`, `live`, `completed`).

### FR-005 Challenge Creation
- A room member can challenge another member on a selected match.
- Challenger selects one outcome (`home`, `away`, `draw`); defender pick is assigned as opposite side.
- Challenger defines punishment text.

**Acceptance Criteria**
- Challenge is created in `pending` state.
- Invalid target defender (not in room) is rejected.

### FR-006 Challenge Response
- Defender can accept or reject pending challenge.

**Acceptance Criteria**
- Accept changes status from `pending` to `accepted` (or `active`, based on backend state model).
- Reject changes status to `rejected` and challenge is excluded from active leaderboard impact.

### FR-007 Automated Result Resolution
- After match completion, system resolves winner/loser based on final score and picks.

**Acceptance Criteria**
- Challenge status transitions to `challenger_won` or `defender_won`.
- Resolution is deterministic and idempotent.

### FR-008 Punishment Completion Confirmation
- After match resolution, loser clicks to confirm punishment completion (`mark_done`).
- Winner then approves completion (`approve_done`).
- Challenge transitions: `challenger_won`/`defender_won` -> `active` -> `completed`.

**Acceptance Criteria**
- Only the loser can mark punishment as completed.
- Only the winner can approve the completion.
- Room members see challenge status updates after each step.

### FR-009 Realtime Room Activity
- Room member list, challenges, and leaderboard update in near real time.

**Acceptance Criteria**
- Clients subscribed to room events see updates without manual refresh.
- Reconnect logic recovers stream after temporary disconnection.

### FR-010 Responsive and Mobile Usability Compliance
- All user-facing screens must be implemented with a mobile-first layout strategy.
- Responsive behavior must use standard Tailwind breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`).
- Primary interactive controls must meet minimum touch target size of 44x44px.
- Critical content must remain readable and non-overlapping across required viewports.

**Acceptance Criteria**
- Core flows are fully usable at 375px, 414px, 768px, 1024px, and 1440px widths.
- No horizontal scroll appears in core product screens under normal usage.
- Body text maintains readable baseline sizing (>= 1rem) for mobile views.

## 4) Domain Rules
- No real-money transactions are allowed.
- Challenge participants must be members of the same room.
- A challenge references exactly one match.
- Match outcome source of truth is synced data in `matches_cache`.

## 5) Error Handling Requirements
- Provide user-friendly messages for passcode mismatch, invalid challenge data, upload failure, and stale match state.
- Preserve auditability via server logs for challenge creation, acceptance/rejection, and result resolution.

## 6) Out of Scope for V1
- Account system and social login.
- Real-money stake support.
- Complex moderation workflows.
- Cross-room federation and public room discovery.
