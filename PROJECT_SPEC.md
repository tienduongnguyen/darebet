# Project Specification: DareBet - World Cup Challenge Platform (P2P)
## 1. Project Overview
- **Goal:** A fun, zero-money peer-to-peer (P2P) betting web application for friends during the World Cup. Instead of currency, users bet using real-life challenges/dares (e.g., 30 push-ups, text an ex, call parents).
- **Core Mechanism:** No-login required. Users create/join rooms via a passcode. The app fetches match schedules and odds from "The Odds API" to act as an automated referee.
- **Target Platform:** Mobile-First Web Application (Progressive Web App compatible).
---
## 2. Technical Stack
- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Styling & UI:** TailwindCSS + DaisyUI (Theme: Dark/Sports-centric)
- **Backend-as-a-Service (BaaS):** Supabase
 - PostgreSQL (Database)
 - Supabase Realtime (For instant challenge updates & room leaderboards)
 - Supabase Storage (For uploading "Proof of Dare" images/videos)
- **Data Provider:** The Odds API (Free Tier - 500 requests/month quota optimization)
- **Automation:** Vercel Cron Jobs (Hourly sync for odds, post-match sync for results)
- **Client Identity:** Browser `localStorage` + UUID (Strictly Passwordless/No-Login)
---
## 3. Database Schema (PostgreSQL DDL)
Execute the following DDL in Supabase SQL Editor:
```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";
-- 1. MATCHES CACHE TABLE (To save The Odds API quota)
create table public.matches_cache (
   id text primary key, -- Match ID from The Odds API
   sport_key text not null,
   home_team text not null,
   away_team text not null,
   commence_time timestamptz not null,
   home_odds numeric(5,2),
   away_odds numeric(5,2),
   draw_odds numeric(5,2),
   status text default 'uncommenced', -- uncommenced, live, completed
   home_score integer,
   away_score integer,
   updated_at timestamptz default timezone('utc'::text, now()) not null
);
-- 2. ROOMS TABLE
create table public.rooms (
   id uuid default gen_random_uuid() primary key,
   room_name text not null,
   passcode varchar(4) not null, -- 4-digit pin
   created_by uuid not null, -- guest_id of creator
   created_at timestamptz default timezone('utc'::text, now()) not null
);
-- 3. ROOM MEMBERS TABLE
create table public.room_members (
   id bigint generated always as identity primary key,
   room_id uuid references public.rooms(id) on delete cascade not null,
   guest_id uuid not null,
   display_name text not null,
   joined_at timestamptz default timezone('utc'::text, now()) not null,
   unique(room_id, guest_id)
);
-- 4. CHALLENGES TABLE (The P2P Bets)
create table public.challenges (
   id uuid default gen_random_uuid() primary key,
   room_id uuid references public.rooms(id) on delete cascade not null,
   match_id text references public.matches_cache(id) not null,
   challenger_id uuid not null,
   defender_id uuid not null,
   challenger_pick text not null, -- 'home', 'away', 'draw'
   defender_pick text not null,   -- auto-assigned opposite of challenger_pick
   punishment text not null,      -- The Dare description
   proof_url text,                -- (Deprecated) proof upload workflow removed; column retained for compatibility
   status text default 'pending', -- pending, accepted, rejected, active, challenger_won, defender_won, completed
   created_at timestamptz default timezone('utc'::text, now()) not null
);
-- Enable Realtime for relevant tables
alter publish replica identity full for public.challenges;
alter publish replica identity full for public.room_members;