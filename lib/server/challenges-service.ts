import "server-only";

import type {
  ChallengeEntity,
  ChallengeVoteEntity,
  MatchStatus,
  MatchesCacheEntity,
  RoomEntity,
  RoomMemberEntity,
  UUID,
  VotePick,
} from "@/lib/types/domain";
import { isUuid, isVotePick, sanitizeText } from "@/lib/validation/common";

import { SupabaseRestError, supabaseRest } from "./supabase-rest";

export const VOTING_LOCK_BEFORE_KICKOFF_MS = 10 * 60 * 1000;

export type ChallengeServiceErrorCode =
  | "invalid_room_id"
  | "invalid_challenge_id"
  | "invalid_guest_id"
  | "invalid_match_id"
  | "invalid_pick"
  | "invalid_punishment"
  | "room_not_found"
  | "not_room_member"
  | "not_room_host"
  | "match_not_found"
  | "match_not_open"
  | "voting_closed"
  | "challenge_exists"
  | "challenge_not_found"
  | "challenge_not_resolved"
  | "not_losing_voter"
  | "invalid_challenge_status"
  | "unknown";

export class ChallengeServiceError extends Error {
  code: ChallengeServiceErrorCode;

  constructor(code: ChallengeServiceErrorCode, message: string) {
    super(message);
    this.name = "ChallengeServiceError";
    this.code = code;
  }
}

interface CreateChallengeInput {
  roomId: UUID;
  guestId: UUID;
  matchId: string;
  punishment: string;
}

interface CastChallengeVoteInput {
  roomId: UUID;
  challengeId: UUID;
  guestId: UUID;
  pick: VotePick;
}

interface MarkPunishmentDoneInput {
  roomId: UUID;
  challengeId: UUID;
  guestId: UUID;
}

interface MatchFeedItem {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_odds: number | null;
  away_odds: number | null;
  draw_odds: number | null;
  status: MatchStatus;
}

export interface ChallengeVoteView {
  guest_id: UUID;
  display_name: string | null;
  pick: VotePick;
  punishment_done: boolean;
  voted_at: string;
}

export interface ChallengeMatchView {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
}

export interface RoomChallengeView extends ChallengeEntity {
  created_by_name: string | null;
  match: ChallengeMatchView | null;
  votes: ChallengeVoteView[];
}

export interface VotedUpcomingMatchItem {
  challenge_id: UUID;
  challenge_status: ChallengeEntity["status"];
  voting_deadline: string;
  pick: VotePick;
  voted_at: string;
  room_id: UUID;
  room_name: string | null;
  match: ChallengeMatchView;
}

interface VotedMatchEmbedRow {
  pick: VotePick;
  voted_at: string;
  challenge: {
    id: UUID;
    room_id: UUID;
    status: ChallengeEntity["status"];
    voting_deadline: string;
    room: { room_name: string } | null;
    match: ChallengeMatchView | null;
  } | null;
}

const normalizeUuid = (value: string, code: ChallengeServiceErrorCode): UUID => {
  if (!isUuid(value)) {
    throw new ChallengeServiceError(code, "Identifier must be a valid UUID.");
  }

  return value;
};

const normalizeMatchId = (value: string): string => {
  const normalized = sanitizeText(value);

  if (!normalized) {
    throw new ChallengeServiceError("invalid_match_id", "Match ID is required.");
  }

  return normalized;
};

const normalizePunishment = (value: string): string => {
  const normalized = sanitizeText(value);

  if (normalized.length < 3 || normalized.length > 220) {
    throw new ChallengeServiceError(
      "invalid_punishment",
      "Punishment must be between 3 and 220 characters.",
    );
  }

  return normalized;
};

const normalizePick = (value: string): VotePick => {
  if (!isVotePick(value)) {
    throw new ChallengeServiceError(
      "invalid_pick",
      "Vote must be either 'home' or 'away'. A drawn match is a tie for everyone.",
    );
  }

  return value;
};

const mapSupabaseError = (error: unknown): ChallengeServiceError => {
  if (!(error instanceof SupabaseRestError)) {
    return new ChallengeServiceError("unknown", "Unexpected server error.");
  }

  if (error.code === "22P02") {
    return new ChallengeServiceError("invalid_room_id", "Room ID is invalid.");
  }

  if (error.code === "23505") {
    return new ChallengeServiceError(
      "challenge_exists",
      "This match already has a challenge in this room.",
    );
  }

  return new ChallengeServiceError("unknown", error.message);
};

const pickSingleRecord = <T>(rows: T[] | null | undefined): T | null => {
  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0] ?? null;
};

const findRoom = async (roomId: UUID): Promise<RoomEntity> => {
  const rows = await supabaseRest<RoomEntity[]>({
    endpoint: "rooms",
    method: "GET",
    query: {
      select: "id,room_name,passcode,created_by,created_at",
      id: `eq.${roomId}`,
      limit: 1,
    },
  });

  const room = pickSingleRecord(rows);

  if (!room) {
    throw new ChallengeServiceError("room_not_found", "Room does not exist.");
  }

  return room;
};

const ensureMembership = async (
  roomId: UUID,
  guestId: UUID,
  errorMessage: string,
): Promise<RoomMemberEntity> => {
  const rows = await supabaseRest<RoomMemberEntity[]>({
    endpoint: "room_members",
    method: "GET",
    query: {
      select: "id,room_id,guest_id,display_name,joined_at",
      room_id: `eq.${roomId}`,
      guest_id: `eq.${guestId}`,
      limit: 1,
    },
  });

  const membership = pickSingleRecord(rows);

  if (!membership) {
    throw new ChallengeServiceError("not_room_member", errorMessage);
  }

  return membership;
};

const findOpenMatch = async (matchId: string): Promise<MatchesCacheEntity> => {
  const rows = await supabaseRest<MatchesCacheEntity[]>({
    endpoint: "matches_cache",
    method: "GET",
    query: {
      select:
        "id,sport_key,home_team,away_team,commence_time,home_odds,away_odds,draw_odds,status,home_score,away_score,updated_at",
      id: `eq.${matchId}`,
      limit: 1,
    },
  });

  const match = pickSingleRecord(rows);

  if (!match) {
    throw new ChallengeServiceError("match_not_found", "Match does not exist.");
  }

  if (match.status !== "uncommenced") {
    throw new ChallengeServiceError(
      "match_not_open",
      "Only upcoming matches can receive new challenges.",
    );
  }

  return match;
};

const findChallenge = async (
  roomId: UUID,
  challengeId: UUID,
): Promise<ChallengeEntity> => {
  const rows = await supabaseRest<ChallengeEntity[]>({
    endpoint: "challenges",
    method: "GET",
    query: {
      select:
        "id,room_id,match_id,created_by,punishment,voting_deadline,status,created_at",
      id: `eq.${challengeId}`,
      room_id: `eq.${roomId}`,
      limit: 1,
    },
  });

  const challenge = pickSingleRecord(rows);

  if (!challenge) {
    throw new ChallengeServiceError(
      "challenge_not_found",
      "Challenge does not exist in this room.",
    );
  }

  return challenge;
};

export const getMatchFeed = async (): Promise<MatchFeedItem[]> => {
  const rows = await supabaseRest<MatchFeedItem[]>({
    endpoint: "matches_cache",
    method: "GET",
    query: {
      select:
        "id,home_team,away_team,commence_time,home_odds,away_odds,draw_odds,status",
      status: "in.(uncommenced,live)",
      order: "commence_time.asc",
      limit: 50,
    },
  });

  return rows;
};

export const createChallenge = async (
  input: CreateChallengeInput,
): Promise<ChallengeEntity> => {
  const roomId = normalizeUuid(input.roomId, "invalid_room_id");
  const guestId = normalizeUuid(input.guestId, "invalid_guest_id");
  const matchId = normalizeMatchId(input.matchId);
  const punishment = normalizePunishment(input.punishment);

  try {
    const room = await findRoom(roomId);

    if (room.created_by !== guestId) {
      throw new ChallengeServiceError(
        "not_room_host",
        "Only the room host can start a challenge.",
      );
    }

    const [, match] = await Promise.all([
      ensureMembership(
        roomId,
        guestId,
        "You must join this room before creating challenges.",
      ),
      findOpenMatch(matchId),
    ]);

    const votingDeadlineMs =
      new Date(match.commence_time).getTime() - VOTING_LOCK_BEFORE_KICKOFF_MS;

    if (Date.now() >= votingDeadlineMs) {
      throw new ChallengeServiceError(
        "voting_closed",
        "Voting closes 10 minutes before kickoff; this match is too close to start.",
      );
    }

    const rows = await supabaseRest<ChallengeEntity[]>({
      endpoint: "challenges",
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: [
        {
          room_id: roomId,
          match_id: matchId,
          created_by: guestId,
          punishment,
          voting_deadline: new Date(votingDeadlineMs).toISOString(),
          status: "voting",
        },
      ],
    });

    const challenge = pickSingleRecord(rows);

    if (!challenge) {
      throw new ChallengeServiceError(
        "unknown",
        "Challenge could not be created right now.",
      );
    }

    return challenge;
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const castChallengeVote = async (
  input: CastChallengeVoteInput,
): Promise<ChallengeVoteEntity> => {
  const roomId = normalizeUuid(input.roomId, "invalid_room_id");
  const challengeId = normalizeUuid(input.challengeId, "invalid_challenge_id");
  const guestId = normalizeUuid(input.guestId, "invalid_guest_id");
  const pick = normalizePick(input.pick);

  try {
    await ensureMembership(
      roomId,
      guestId,
      "You must join this room before voting.",
    );

    const challenge = await findChallenge(roomId, challengeId);

    if (challenge.status !== "voting") {
      throw new ChallengeServiceError(
        "invalid_challenge_status",
        "This challenge has already been resolved.",
      );
    }

    if (Date.now() >= new Date(challenge.voting_deadline).getTime()) {
      throw new ChallengeServiceError(
        "voting_closed",
        "Voting closed 10 minutes before kickoff.",
      );
    }

    // Upsert: members can change their vote freely until the deadline.
    const rows = await supabaseRest<ChallengeVoteEntity[]>({
      endpoint: "challenge_votes",
      method: "POST",
      query: {
        on_conflict: "challenge_id,guest_id",
      },
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: [
        {
          challenge_id: challengeId,
          guest_id: guestId,
          pick,
          voted_at: new Date().toISOString(),
        },
      ],
    });

    const vote = pickSingleRecord(rows);

    if (!vote) {
      throw new ChallengeServiceError(
        "unknown",
        "Vote could not be saved right now.",
      );
    }

    return vote;
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const markPunishmentDone = async (
  input: MarkPunishmentDoneInput,
): Promise<ChallengeVoteEntity> => {
  const roomId = normalizeUuid(input.roomId, "invalid_room_id");
  const challengeId = normalizeUuid(input.challengeId, "invalid_challenge_id");
  const guestId = normalizeUuid(input.guestId, "invalid_guest_id");

  try {
    await ensureMembership(
      roomId,
      guestId,
      "You must join this room before updating punishment completion.",
    );

    const challenge = await findChallenge(roomId, challengeId);

    if (challenge.status !== "home_won" && challenge.status !== "away_won") {
      throw new ChallengeServiceError(
        "challenge_not_resolved",
        "Punishment completion is only available after a decisive match result.",
      );
    }

    const losingPick: VotePick = challenge.status === "home_won" ? "away" : "home";

    const rows = await supabaseRest<ChallengeVoteEntity[]>({
      endpoint: "challenge_votes",
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      query: {
        challenge_id: `eq.${challengeId}`,
        guest_id: `eq.${guestId}`,
        pick: `eq.${losingPick}`,
      },
      body: {
        punishment_done: true,
      },
    });

    const vote = pickSingleRecord(rows);

    if (!vote) {
      throw new ChallengeServiceError(
        "not_losing_voter",
        "Only members who voted for the losing side can confirm their punishment.",
      );
    }

    return vote;
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const listRoomChallenges = async (
  roomId: string,
  guestId: string,
): Promise<RoomChallengeView[]> => {
  const normalizedRoomId = normalizeUuid(roomId, "invalid_room_id");
  const normalizedGuestId = normalizeUuid(guestId, "invalid_guest_id");

  try {
    await ensureMembership(
      normalizedRoomId,
      normalizedGuestId,
      "You must join this room before viewing challenges.",
    );

    const [challengeRows, memberRows] = await Promise.all([
      supabaseRest<ChallengeEntity[]>({
        endpoint: "challenges",
        method: "GET",
        query: {
          select:
            "id,room_id,match_id,created_by,punishment,voting_deadline,status,created_at",
          room_id: `eq.${normalizedRoomId}`,
          order: "created_at.desc",
        },
      }),
      supabaseRest<RoomMemberEntity[]>({
        endpoint: "room_members",
        method: "GET",
        query: {
          select: "id,room_id,guest_id,display_name,joined_at",
          room_id: `eq.${normalizedRoomId}`,
        },
      }),
    ]);

    const nameByGuestId = new Map<string, string>();

    for (const member of memberRows) {
      nameByGuestId.set(member.guest_id, member.display_name);
    }

    const challengeIds = challengeRows.map((challenge) => challenge.id);
    const matchIds = Array.from(
      new Set(challengeRows.map((challenge) => challenge.match_id)),
    );

    const [voteRows, matchRows] = await Promise.all([
      challengeIds.length > 0
        ? supabaseRest<ChallengeVoteEntity[]>({
            endpoint: "challenge_votes",
            method: "GET",
            query: {
              select: "id,challenge_id,guest_id,pick,punishment_done,voted_at",
              challenge_id: `in.(${challengeIds.join(",")})`,
              order: "voted_at.asc",
            },
          })
        : Promise.resolve([] as ChallengeVoteEntity[]),
      matchIds.length > 0
        ? supabaseRest<ChallengeMatchView[]>({
            endpoint: "matches_cache",
            method: "GET",
            query: {
              select:
                "id,home_team,away_team,commence_time,status,home_score,away_score",
              id: `in.(${matchIds.map((id) => `"${id}"`).join(",")})`,
            },
          })
        : Promise.resolve([] as ChallengeMatchView[]),
    ]);

    const votesByChallengeId = new Map<string, ChallengeVoteView[]>();

    for (const vote of voteRows) {
      const views = votesByChallengeId.get(vote.challenge_id) ?? [];

      views.push({
        guest_id: vote.guest_id,
        display_name: nameByGuestId.get(vote.guest_id) ?? null,
        pick: vote.pick,
        punishment_done: vote.punishment_done,
        voted_at: vote.voted_at,
      });

      votesByChallengeId.set(vote.challenge_id, views);
    }

    const matchById = new Map<string, ChallengeMatchView>();

    for (const match of matchRows) {
      matchById.set(match.id, match);
    }

    return challengeRows.map((challenge) => ({
      ...challenge,
      created_by_name: nameByGuestId.get(challenge.created_by) ?? null,
      match: matchById.get(challenge.match_id) ?? null,
      votes: votesByChallengeId.get(challenge.id) ?? [],
    }));
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const listVotedUpcomingMatches = async (
  guestId: string,
): Promise<VotedUpcomingMatchItem[]> => {
  const normalizedGuestId = normalizeUuid(guestId, "invalid_guest_id");

  try {
    const rows = await supabaseRest<VotedMatchEmbedRow[]>({
      endpoint: "challenge_votes",
      method: "GET",
      query: {
        select:
          "pick,voted_at,challenge:challenges(id,room_id,status,voting_deadline,room:rooms(room_name),match:matches_cache(id,home_team,away_team,commence_time,status,home_score,away_score))",
        guest_id: `eq.${normalizedGuestId}`,
        order: "voted_at.desc",
      },
    });

    return rows
      .filter(
        (row): row is VotedMatchEmbedRow & {
          challenge: NonNullable<VotedMatchEmbedRow["challenge"]> & {
            match: ChallengeMatchView;
          };
        } =>
          row.challenge !== null &&
          row.challenge.match !== null &&
          row.challenge.match.status !== "completed",
      )
      .map((row) => ({
        challenge_id: row.challenge.id,
        challenge_status: row.challenge.status,
        voting_deadline: row.challenge.voting_deadline,
        pick: row.pick,
        voted_at: row.voted_at,
        room_id: row.challenge.room_id,
        room_name: row.challenge.room?.room_name ?? null,
        match: row.challenge.match,
      }))
      .sort(
        (left, right) =>
          new Date(left.match.commence_time).getTime() -
          new Date(right.match.commence_time).getTime(),
      );
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};
