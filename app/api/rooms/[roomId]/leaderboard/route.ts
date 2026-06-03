import { NextResponse } from "next/server";

import { calculateLeaderboard } from "@/lib/domain/leaderboard";
import {
  ChallengeServiceError,
  listRoomChallenges,
} from "@/lib/server/challenges-service";
import { getRoomMembersForGuest, RoomServiceError } from "@/lib/server/rooms-service";

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
    const [roomMembership, challenges] = await Promise.all([
      getRoomMembersForGuest(roomId, guestId),
      listRoomChallenges(roomId, guestId),
    ]);

    const leaderboard = calculateLeaderboard(roomMembership.members, challenges);

    return NextResponse.json(
      {
        leaderboard,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    if (error instanceof RoomServiceError) {
      const statusByErrorCode: Record<string, number> = {
        invalid_guest_id: 400,
        invalid_room_id: 400,
        room_not_found: 404,
        not_room_member: 403,
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

    if (error instanceof ChallengeServiceError) {
      const statusByErrorCode: Record<string, number> = {
        invalid_room_id: 400,
        invalid_guest_id: 400,
        room_not_found: 404,
        not_room_member: 403,
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
        error: "Could not calculate leaderboard right now.",
      },
      {
        status: 500,
      },
    );
  }
}
