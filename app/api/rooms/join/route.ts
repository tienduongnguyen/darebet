import { NextResponse } from "next/server";

import { joinRoom, RoomServiceError } from "@/lib/server/rooms-service";

interface JoinRoomPayload {
  roomId?: unknown;
  passcode?: unknown;
  guestId?: unknown;
  displayName?: unknown;
}

export async function POST(request: Request) {
  let payload: JoinRoomPayload;

  try {
    payload = (await request.json()) as JoinRoomPayload;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof payload.roomId !== "string" ||
    typeof payload.passcode !== "string" ||
    typeof payload.guestId !== "string" ||
    typeof payload.displayName !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "roomId, passcode, guestId, and displayName are required string fields.",
      },
      { status: 400 },
    );
  }

  try {
    const { room } = await joinRoom({
      roomId: payload.roomId,
      passcode: payload.passcode,
      guestId: payload.guestId,
      displayName: payload.displayName,
    });

    return NextResponse.json(
      {
        room: {
          id: room.id,
          room_name: room.room_name,
          created_at: room.created_at,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof RoomServiceError) {
      const statusByErrorCode: Record<string, number> = {
        invalid_guest_id: 400,
        invalid_display_name: 400,
        invalid_room_id: 400,
        invalid_passcode: 400,
        room_not_found: 404,
        duplicate_join: 409,
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
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
