import { NextResponse } from "next/server";

import {
  castChallengeVote,
  ChallengeServiceError,
} from "@/lib/server/challenges-service";
import { isVotePick } from "@/lib/validation/common";

interface CastVotePayload {
  guestId?: unknown;
  pick?: unknown;
}

const statusByChallengeErrorCode: Record<string, number> = {
  invalid_room_id: 400,
  invalid_challenge_id: 400,
  invalid_guest_id: 400,
  invalid_pick: 400,
  room_not_found: 404,
  not_room_member: 403,
  challenge_not_found: 404,
  voting_closed: 409,
  invalid_challenge_status: 409,
};

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ roomId: string; challengeId: string }>;
  },
) {
  const { roomId, challengeId } = await params;
  let payload: CastVotePayload;

  try {
    payload = (await request.json()) as CastVotePayload;
  } catch {
    return NextResponse.json(
      {
        error: "Request body must be valid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.guestId !== "string") {
    return NextResponse.json(
      {
        error: "guestId is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.pick !== "string" || !isVotePick(payload.pick)) {
    return NextResponse.json(
      {
        error: "pick must be either 'home' or 'away'.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const vote = await castChallengeVote({
      roomId,
      challengeId,
      guestId: payload.guestId,
      pick: payload.pick,
    });

    return NextResponse.json(
      {
        vote,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: statusByChallengeErrorCode[error.code] ?? 500,
        },
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
