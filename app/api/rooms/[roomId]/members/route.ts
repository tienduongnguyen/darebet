import { NextResponse } from "next/server";

import { getRoomMembersForGuest, RoomServiceError } from "@/lib/server/rooms-service";

interface RoomMembersResponse {
  room: {
    id: string;
    room_name: string;
    created_by: string;
    created_at: string;
  };
  members: Array<{
    id: number;
    room_id: string;
    guest_id: string;
    display_name: string;
    joined_at: string;
  }>;
}

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
    const result = await getRoomMembersForGuest(roomId, guestId);

    const response: RoomMembersResponse = {
      room: {
        id: result.room.id,
        room_name: result.room.room_name,
        created_by: result.room.created_by,
        created_at: result.room.created_at,
      },
      members: result.members,
    };

    return NextResponse.json(response, { status: 200 });
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

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
