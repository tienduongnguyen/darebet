import "server-only";

import { serverEnv } from "@/lib/env/server";

interface OddsApiOutcome {
  name: string;
  price: number;
}

interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  markets: OddsApiMarket[];
}

interface OddsApiScore {
  name: string;
  score: string | number | null;
}

interface OddsApiMatch {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed?: boolean;
  scores?: OddsApiScore[];
  bookmakers?: OddsApiBookmaker[];
}

export interface OddsSnapshotMatch {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_odds: number | null;
  away_odds: number | null;
  draw_odds: number | null;
  status: "uncommenced" | "live" | "completed";
  home_score: number | null;
  away_score: number | null;
}

export interface OddsApiQuota {
  requests_remaining: number | null;
  requests_used: number | null;
}

export interface OddsSnapshotPayload {
  matches: OddsSnapshotMatch[];
  quota: OddsApiQuota;
}

class OddsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OddsApiError";
    this.status = status;
  }
}

const WORLD_CUP_SPORT_KEY = "soccer_fifa_world_cup";

const parseHeaderNumber = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseScoreValue = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractOdds = (match: OddsApiMatch): {
  home_odds: number | null;
  away_odds: number | null;
  draw_odds: number | null;
} => {
  const firstBookmaker = match.bookmakers?.[0];
  const h2hMarket = firstBookmaker?.markets.find((market) => market.key === "h2h");

  if (!h2hMarket) {
    return {
      home_odds: null,
      away_odds: null,
      draw_odds: null,
    };
  }

  const homeOdds =
    h2hMarket.outcomes.find((outcome) => outcome.name === match.home_team)?.price ??
    null;

  const awayOdds =
    h2hMarket.outcomes.find((outcome) => outcome.name === match.away_team)?.price ??
    null;

  const drawOdds =
    h2hMarket.outcomes.find(
      (outcome) => outcome.name.toLowerCase() === "draw" || outcome.name === "Tie",
    )?.price ?? null;

  return {
    home_odds: homeOdds,
    away_odds: awayOdds,
    draw_odds: drawOdds,
  };
};

const extractScores = (match: OddsApiMatch): {
  home_score: number | null;
  away_score: number | null;
} => {
  if (!match.scores || match.scores.length === 0) {
    return {
      home_score: null,
      away_score: null,
    };
  }

  const homeScoreRaw = match.scores.find((score) => score.name === match.home_team)?.score;
  const awayScoreRaw = match.scores.find((score) => score.name === match.away_team)?.score;

  return {
    home_score: parseScoreValue(homeScoreRaw),
    away_score: parseScoreValue(awayScoreRaw),
  };
};

const resolveStatus = (match: OddsApiMatch): "uncommenced" | "live" | "completed" => {
  if (match.completed) {
    return "completed";
  }

  const now = Date.now();
  const kickoffTime = new Date(match.commence_time).getTime();

  if (!Number.isFinite(kickoffTime)) {
    return "uncommenced";
  }

  return kickoffTime <= now ? "live" : "uncommenced";
};

const mapOddsApiMatch = (match: OddsApiMatch): OddsSnapshotMatch => {
  const odds = extractOdds(match);
  const scores = extractScores(match);

  return {
    id: match.id,
    sport_key: match.sport_key,
    home_team: match.home_team,
    away_team: match.away_team,
    commence_time: match.commence_time,
    home_odds: odds.home_odds,
    away_odds: odds.away_odds,
    draw_odds: odds.draw_odds,
    status: resolveStatus(match),
    home_score: scores.home_score,
    away_score: scores.away_score,
  };
};

const fetchFromOddsApi = async (
  endpointPath: string,
): Promise<{ matches: OddsApiMatch[]; quota: OddsApiQuota }> => {
  const url = new URL(`${serverEnv.ODDS_API_BASE_URL}${endpointPath}`);
  url.searchParams.set("apiKey", serverEnv.ODDS_API_KEY);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new OddsApiError("Odds API request failed", response.status);
  }

  const payload = (await response.json()) as OddsApiMatch[];
  const quota: OddsApiQuota = {
    requests_remaining: parseHeaderNumber(
      response.headers.get("x-requests-remaining"),
    ),
    requests_used: parseHeaderNumber(response.headers.get("x-requests-used")),
  };

  return {
    matches: payload,
    quota,
  };
};

export const fetchOddsSnapshot = async (): Promise<OddsSnapshotPayload> => {
  const endpointPath = `/sports/${WORLD_CUP_SPORT_KEY}/odds/?regions=eu&markets=h2h&oddsFormat=decimal`;
  const payload = await fetchFromOddsApi(endpointPath);

  return {
    matches: payload.matches.map(mapOddsApiMatch),
    quota: payload.quota,
  };
};

export const fetchResultSnapshot = async (): Promise<OddsSnapshotPayload> => {
  const endpointPath = `/sports/${WORLD_CUP_SPORT_KEY}/scores/?daysFrom=3`;
  const payload = await fetchFromOddsApi(endpointPath);

  return {
    matches: payload.matches.map(mapOddsApiMatch),
    quota: payload.quota,
  };
};
