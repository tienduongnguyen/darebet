import { NextResponse } from "next/server";

import {
  ChallengeServiceError,
  listVotedUpcomingMatches,
} from "@/lib/server/challenges-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const guestId = searchParams.get("guestId");

  if (!guestId) {
    return NextResponse.json(
      { error: "guestId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const votedMatches = await listVotedUpcomingMatches(guestId);

    return NextResponse.json(
      {
        voted_matches: votedMatches,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    if (error instanceof ChallengeServiceError) {
      const statusByErrorCode: Record<string, number> = {
        invalid_guest_id: 400,
      };

      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: statusByErrorCode[error.code] ?? 500,
        },
      );
    }

    return NextResponse.json(
      {
        error: "Could not load voted matches right now.",
      },
      {
        status: 500,
      },
    );
  }
}
