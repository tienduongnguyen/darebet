import { NextResponse } from "next/server";

import {
  ChallengeServiceError,
  markPunishmentDone,
} from "@/lib/server/challenges-service";

interface MarkPunishmentDonePayload {
  guestId?: unknown;
}

const statusByChallengeErrorCode: Record<string, number> = {
  invalid_room_id: 400,
  invalid_challenge_id: 400,
  invalid_guest_id: 400,
  room_not_found: 404,
  not_room_member: 403,
  challenge_not_found: 404,
  challenge_not_resolved: 409,
  not_losing_voter: 403,
  invalid_challenge_status: 409,
};

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ roomId: string; challengeId: string }>;
  },
) {
  const { roomId, challengeId } = await params;

  let payload: MarkPunishmentDonePayload;

  try {
    payload = (await request.json()) as MarkPunishmentDonePayload;
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

  try {
    const vote = await markPunishmentDone({
      roomId,
      challengeId,
      guestId: payload.guestId,
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
