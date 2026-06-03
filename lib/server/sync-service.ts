import "server-only";

import type { ChallengeStatus, MatchOutcome } from "@/lib/types/domain";

import {
  fetchOddsSnapshot,
  fetchResultSnapshot,
  OddsApiQuota,
  OddsSnapshotMatch,
} from "./odds-api";
import { supabaseRest } from "./supabase-rest";

interface SyncSummary {
  source: "odds" | "results";
  fetched_count: number;
  upserted_count: number;
  resolved_challenges: number;
  quota: OddsApiQuota;
  finished_at: string;
}

const challengeStatusByOutcome: Record<MatchOutcome, ChallengeStatus> = {
  home: "home_won",
  away: "away_won",
  draw: "draw",
};

const baseRow = (match: OddsSnapshotMatch, updatedAt: string) => ({
  id: match.id,
  sport_key: match.sport_key,
  home_team: match.home_team,
  away_team: match.away_team,
  commence_time: match.commence_time,
  status: match.status,
  updated_at: updatedAt,
});

// Odds sync owns the odds columns only. It must NOT write score columns: the
// odds endpoint never returns scores, so writing them would null out the
// score of a live match. PostgREST merge-upsert only updates columns present
// in the payload, so omitting score columns leaves them untouched.
const mapOddsRows = (matches: OddsSnapshotMatch[]) => {
  const updatedAt = new Date().toISOString();

  return matches.map((match) => ({
    ...baseRow(match, updatedAt),
    home_odds: match.home_odds,
    away_odds: match.away_odds,
    draw_odds: match.draw_odds,
  }));
};

// Result sync owns the score columns only. It must NOT write odds columns: the
// scores endpoint carries no bookmakers, so writing them would wipe the odds.
const mapResultRows = (matches: OddsSnapshotMatch[]) => {
  const updatedAt = new Date().toISOString();

  return matches.map((match) => ({
    ...baseRow(match, updatedAt),
    home_score: match.home_score,
    away_score: match.away_score,
  }));
};

const upsertMatchRows = async (
  rows: Array<{ id: string }>,
): Promise<number> => {
  if (rows.length === 0) {
    return 0;
  }

  await supabaseRest<unknown>({
    endpoint: "matches_cache",
    method: "POST",
    query: {
      on_conflict: "id",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: rows,
  });

  return rows.length;
};

const resolveOutcomePick = (
  homeScore: number,
  awayScore: number,
): MatchOutcome => {
  if (homeScore > awayScore) {
    return "home";
  }

  if (awayScore > homeScore) {
    return "away";
  }

  return "draw";
};

const resolveChallengesForCompletedMatch = async (
  match: OddsSnapshotMatch,
): Promise<number> => {
  if (
    match.status !== "completed" ||
    match.home_score === null ||
    match.away_score === null
  ) {
    return 0;
  }

  const outcome = resolveOutcomePick(match.home_score, match.away_score);

  // Every room challenge on this match shares the same outcome, so one
  // bulk update closes all open voting rounds at once.
  const updated = await supabaseRest<Array<{ id: string }>>({
    endpoint: "challenges",
    method: "PATCH",
    query: {
      match_id: `eq.${match.id}`,
      status: "eq.voting",
    },
    headers: {
      Prefer: "return=representation",
    },
    body: {
      status: challengeStatusByOutcome[outcome],
    },
  });

  return updated.length;
};

const resolveChallengesForCompletedMatches = async (
  matches: OddsSnapshotMatch[],
): Promise<number> => {
  let totalResolved = 0;

  for (const match of matches) {
    totalResolved += await resolveChallengesForCompletedMatch(match);
  }

  return totalResolved;
};

const buildSummary = (
  source: SyncSummary["source"],
  fetchedCount: number,
  upsertedCount: number,
  resolvedChallenges: number,
  quota: OddsApiQuota,
): SyncSummary => ({
  source,
  fetched_count: fetchedCount,
  upserted_count: upsertedCount,
  resolved_challenges: resolvedChallenges,
  quota,
  finished_at: new Date().toISOString(),
});

export const runOddsSync = async (): Promise<SyncSummary> => {
  const snapshot = await fetchOddsSnapshot();
  const upsertedCount = await upsertMatchRows(mapOddsRows(snapshot.matches));

  const summary = buildSummary(
    "odds",
    snapshot.matches.length,
    upsertedCount,
    0,
    snapshot.quota,
  );

  console.info("[odds_sync] completed", summary);
  return summary;
};

export const runResultSync = async (): Promise<SyncSummary> => {
  const snapshot = await fetchResultSnapshot();
  const upsertedCount = await upsertMatchRows(mapResultRows(snapshot.matches));
  const resolvedChallenges = await resolveChallengesForCompletedMatches(
    snapshot.matches,
  );

  const summary = buildSummary(
    "results",
    snapshot.matches.length,
    upsertedCount,
    resolvedChallenges,
    snapshot.quota,
  );

  console.info("[result_sync] completed", summary);
  return summary;
};

// On-demand sync is triggered by user refreshes, not cron. A cooldown keyed on
// the freshest cache row collapses repeated taps from a small group into at
// most one live Odds API fetch per window — protecting the limited quota.
const SYNC_COOLDOWN_MS = 60_000;

export interface OnDemandSyncResult {
  ran: boolean;
  skipped_reason: "cooldown" | null;
  odds?: SyncSummary;
  results?: SyncSummary;
}

const getLatestCacheUpdateMs = async (): Promise<number | null> => {
  const rows = await supabaseRest<Array<{ updated_at: string }>>({
    endpoint: "matches_cache",
    query: {
      select: "updated_at",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  const latest = rows[0]?.updated_at;

  if (!latest) {
    return null;
  }

  const parsed = new Date(latest).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const runOnDemandSync = async (): Promise<OnDemandSyncResult> => {
  const latest = await getLatestCacheUpdateMs();

  if (latest !== null && Date.now() - latest < SYNC_COOLDOWN_MS) {
    return { ran: false, skipped_reason: "cooldown" };
  }

  // Odds first (sets odds, leaves scores), results second (sets scores +
  // settles challenges, leaves odds) — the two writes never clobber each other.
  const odds = await runOddsSync();
  const results = await runResultSync();

  return { ran: true, skipped_reason: null, odds, results };
};
