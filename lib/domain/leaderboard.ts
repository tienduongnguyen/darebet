import type {
  ChallengeStatus,
  RoomMemberEntity,
  VotePick,
} from "@/lib/types/domain";

export interface LeaderboardEntry {
  guest_id: string;
  display_name: string;
  points: number;
  wins: number;
  losses: number;
  pending: number;
}

interface LeaderboardChallenge {
  status: ChallengeStatus;
  votes: Array<{
    guest_id: string;
    pick: VotePick;
  }>;
}

const resolveWinningPick = (status: ChallengeStatus): VotePick | null => {
  if (status === "home_won") {
    return "home";
  }

  if (status === "away_won") {
    return "away";
  }

  return null;
};

export const calculateLeaderboard = (
  members: Pick<RoomMemberEntity, "guest_id" | "display_name">[],
  challenges: LeaderboardChallenge[],
): LeaderboardEntry[] => {
  const board = new Map<string, LeaderboardEntry>();

  for (const member of members) {
    board.set(member.guest_id, {
      guest_id: member.guest_id,
      display_name: member.display_name,
      points: 0,
      wins: 0,
      losses: 0,
      pending: 0,
    });
  }

  for (const challenge of challenges) {
    const winningPick = resolveWinningPick(challenge.status);

    for (const vote of challenge.votes) {
      const entry = board.get(vote.guest_id);

      if (!entry) {
        continue;
      }

      if (challenge.status === "voting") {
        entry.pending += 1;
        continue;
      }

      // A drawn match is a tie for everyone: no winners, no losers.
      if (!winningPick) {
        continue;
      }

      if (vote.pick === winningPick) {
        entry.wins += 1;
        entry.points += 1;
      } else {
        entry.losses += 1;
      }
    }
  }

  return Array.from(board.values()).sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }

    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }

    return left.display_name.localeCompare(right.display_name);
  });
};
