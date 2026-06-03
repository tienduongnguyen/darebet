export type UUID = string;

export type MatchStatus = "uncommenced" | "live" | "completed";

export type VotePick = "home" | "away";

export type MatchOutcome = "home" | "away" | "draw";

export type ChallengeStatus = "voting" | "home_won" | "away_won" | "draw";

export interface MatchesCacheEntity {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_odds: number | null;
  away_odds: number | null;
  draw_odds: number | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  updated_at: string;
}

export interface RoomEntity {
  id: UUID;
  room_name: string;
  passcode: string;
  created_by: UUID;
  created_at: string;
}

export interface RoomMemberEntity {
  id: number;
  room_id: UUID;
  guest_id: UUID;
  display_name: string;
  joined_at: string;
}

export interface ChallengeEntity {
  id: UUID;
  room_id: UUID;
  match_id: string;
  created_by: UUID;
  punishment: string;
  voting_deadline: string;
  status: ChallengeStatus;
  created_at: string;
}

export interface ChallengeVoteEntity {
  id: number;
  challenge_id: UUID;
  guest_id: UUID;
  pick: VotePick;
  punishment_done: boolean;
  voted_at: string;
}
