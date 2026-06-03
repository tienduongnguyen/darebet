import { NextResponse } from "next/server";

import {
  createRoom,
  listRoomsForGuest,
  RoomServiceError,
} from "@/lib/server/rooms-service";

interface CreateRoomPayload {
  roomName?: unknown;
  passcode?: unknown;
  guestId?: unknown;
  displayName?: unknown;
}

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
    const rooms = await listRoomsForGuest(guestId);

    return NextResponse.json(
      {
        rooms,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof RoomServiceError) {
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
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: CreateRoomPayload;

  try {
    payload = (await request.json()) as CreateRoomPayload;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof payload.roomName !== "string" ||
    typeof payload.passcode !== "string" ||
    typeof payload.guestId !== "string" ||
    typeof payload.displayName !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "roomName, passcode, guestId, and displayName are required string fields.",
      },
      { status: 400 },
    );
  }

  try {
    const { room } = await createRoom({
      roomName: payload.roomName,
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
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RoomServiceError) {
      const statusByErrorCode: Record<string, number> = {
        invalid_guest_id: 400,
        invalid_display_name: 400,
        invalid_room_name: 400,
        invalid_passcode: 400,
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
