import { NextResponse } from "next/server";

import {
  ChallengeServiceError,
  createChallenge,
  listRoomChallenges,
} from "@/lib/server/challenges-service";

interface CreateChallengePayload {
  guestId?: unknown;
  matchId?: unknown;
  punishment?: unknown;
}

const statusByChallengeErrorCode: Record<string, number> = {
  invalid_room_id: 400,
  invalid_challenge_id: 400,
  invalid_guest_id: 400,
  invalid_match_id: 400,
  invalid_pick: 400,
  invalid_punishment: 400,
  room_not_found: 404,
  not_room_member: 403,
  not_room_host: 403,
  match_not_found: 404,
  match_not_open: 409,
  voting_closed: 409,
  challenge_exists: 409,
  challenge_not_found: 404,
  challenge_not_resolved: 409,
  not_losing_voter: 403,
  invalid_challenge_status: 409,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const { searchParams } = new URL(request.url);
  const guestId = searchParams.get("guestId");

  if (!guestId) {
    return NextResponse.json(
      { error: "guestId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const challenges = await listRoomChallenges(roomId, guestId);

    return NextResponse.json(
      { challenges },
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  let payload: CreateChallengePayload;

  try {
    payload = (await request.json()) as CreateChallengePayload;
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

  if (
    typeof payload.guestId !== "string" ||
    typeof payload.matchId !== "string" ||
    typeof payload.punishment !== "string"
  ) {
    return NextResponse.json(
      {
        error: "guestId, matchId, and punishment are required string fields.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const challenge = await createChallenge({
      roomId,
      guestId: payload.guestId,
      matchId: payload.matchId,
      punishment: payload.punishment,
    });

    return NextResponse.json(
      {
        challenge,
      },
      {
        status: 201,
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
