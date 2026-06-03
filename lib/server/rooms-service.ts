import "server-only";

import type { RoomEntity, RoomMemberEntity } from "@/lib/types/domain";
import { isUuid, isValidPasscode, sanitizeText } from "@/lib/validation/common";

import { SupabaseRestError, supabaseRest } from "./supabase-rest";

export type RoomServiceErrorCode =
  | "invalid_guest_id"
  | "invalid_display_name"
  | "invalid_room_name"
  | "invalid_room_id"
  | "invalid_passcode"
  | "room_not_found"
  | "duplicate_join"
  | "not_room_member"
  | "unknown";

export class RoomServiceError extends Error {
  code: RoomServiceErrorCode;

  constructor(code: RoomServiceErrorCode, message: string) {
    super(message);
    this.name = "RoomServiceError";
    this.code = code;
  }
}

interface CreateRoomInput {
  roomName: string;
  passcode: string;
  guestId: string;
  displayName: string;
}

interface JoinRoomInput {
  roomId: string;
  passcode: string;
  guestId: string;
  displayName: string;
}

const normalizeRoomName = (value: string): string => {
  const normalized = sanitizeText(value);

  if (normalized.length < 3 || normalized.length > 40) {
    throw new RoomServiceError(
      "invalid_room_name",
      "Room name must be between 3 and 40 characters.",
    );
  }

  return normalized;
};

const normalizeDisplayName = (value: string): string => {
  const normalized = sanitizeText(value);

  if (normalized.length < 2 || normalized.length > 24) {
    throw new RoomServiceError(
      "invalid_display_name",
      "Display name must be between 2 and 24 characters.",
    );
  }

  return normalized;
};

const assertGuestId = (guestId: string): string => {
  if (!isUuid(guestId)) {
    throw new RoomServiceError("invalid_guest_id", "Guest identity is invalid.");
  }

  return guestId;
};

const assertRoomId = (roomId: string): string => {
  if (!isUuid(roomId)) {
    throw new RoomServiceError("invalid_room_id", "Room identifier is invalid.");
  }

  return roomId;
};

const assertPasscode = (passcode: string): string => {
  if (!isValidPasscode(passcode)) {
    throw new RoomServiceError(
      "invalid_passcode",
      "Passcode must be exactly 4 digits.",
    );
  }

  return passcode;
};

const mapSupabaseError = (error: unknown): RoomServiceError => {
  if (!(error instanceof SupabaseRestError)) {
    return new RoomServiceError("unknown", "Unexpected server error.");
  }

  if (error.code === "23505") {
    return new RoomServiceError(
      "duplicate_join",
      "You already joined this room on this device identity.",
    );
  }

  if (error.code === "22P02") {
    return new RoomServiceError("invalid_room_id", "Room identifier is invalid.");
  }

  return new RoomServiceError("unknown", error.message);
};

const pickSingleRecord = <T>(rows: T[] | null | undefined): T | null => {
  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0] ?? null;
};

export const createRoom = async (
  input: CreateRoomInput,
): Promise<{ room: RoomEntity; member: RoomMemberEntity }> => {
  const roomName = normalizeRoomName(input.roomName);
  const passcode = assertPasscode(input.passcode);
  const guestId = assertGuestId(input.guestId);
  const displayName = normalizeDisplayName(input.displayName);

  let room: RoomEntity | null = null;

  try {
    const createdRooms = await supabaseRest<RoomEntity[]>({
      endpoint: "rooms",
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: [
        {
          room_name: roomName,
          passcode,
          created_by: guestId,
        },
      ],
    });

    room = pickSingleRecord(createdRooms);

    if (!room) {
      throw new RoomServiceError("unknown", "Room could not be created.");
    }

    const createdMembers = await supabaseRest<RoomMemberEntity[]>({
      endpoint: "room_members",
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: [
        {
          room_id: room.id,
          guest_id: guestId,
          display_name: displayName,
        },
      ],
    });

    const member = pickSingleRecord(createdMembers);

    if (!member) {
      throw new RoomServiceError("unknown", "Room membership could not be created.");
    }

    return {
      room,
      member,
    };
  } catch (error) {
    console.error("[rooms-service] createRoom error:", error);

    if (room?.id) {
      try {
        await supabaseRest<null>({
          endpoint: "rooms",
          method: "DELETE",
          query: {
            id: `eq.${room.id}`,
          },
          headers: {
            Prefer: "return=minimal",
          },
        });
      } catch {
        // noop cleanup fallback
      }
    }

    if (error instanceof RoomServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const joinRoom = async (
  input: JoinRoomInput,
): Promise<{ room: RoomEntity; member: RoomMemberEntity }> => {
  const roomId = assertRoomId(input.roomId);
  const passcode = assertPasscode(input.passcode);
  const guestId = assertGuestId(input.guestId);
  const displayName = normalizeDisplayName(input.displayName);

  try {
    const rooms = await supabaseRest<RoomEntity[]>({
      endpoint: "rooms",
      method: "GET",
      query: {
        select: "id,room_name,passcode,created_by,created_at",
        id: `eq.${roomId}`,
        limit: 1,
      },
      headers: {
        Prefer: "count=exact",
      },
    });

    const room = pickSingleRecord(rooms);

    if (!room) {
      throw new RoomServiceError("room_not_found", "Room does not exist.");
    }

    if (room.passcode !== passcode) {
      throw new RoomServiceError("invalid_passcode", "Passcode is incorrect.");
    }

    const createdMembers = await supabaseRest<RoomMemberEntity[]>({
      endpoint: "room_members",
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: [
        {
          room_id: room.id,
          guest_id: guestId,
          display_name: displayName,
        },
      ],
    });

    const member = pickSingleRecord(createdMembers);

    if (!member) {
      throw new RoomServiceError("unknown", "Room membership could not be created.");
    }

    return {
      room,
      member,
    };
  } catch (error) {
    if (error instanceof RoomServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export interface GuestRoomSummary {
  id: string;
  room_name: string;
  created_at: string;
  joined_at: string;
  is_host: boolean;
}

interface GuestRoomEmbedRow {
  joined_at: string;
  room: {
    id: string;
    room_name: string;
    created_by: string;
    created_at: string;
  } | null;
}

export const listRoomsForGuest = async (
  guestId: string,
): Promise<GuestRoomSummary[]> => {
  const normalizedGuestId = assertGuestId(guestId);

  try {
    const rows = await supabaseRest<GuestRoomEmbedRow[]>({
      endpoint: "room_members",
      method: "GET",
      query: {
        select: "joined_at,room:rooms(id,room_name,created_by,created_at)",
        guest_id: `eq.${normalizedGuestId}`,
        order: "joined_at.desc",
      },
    });

    return rows
      .filter((row): row is GuestRoomEmbedRow & {
        room: NonNullable<GuestRoomEmbedRow["room"]>;
      } => row.room !== null)
      .map((row) => ({
        id: row.room.id,
        room_name: row.room.room_name,
        created_at: row.room.created_at,
        joined_at: row.joined_at,
        is_host: row.room.created_by === normalizedGuestId,
      }));
  } catch (error) {
    if (error instanceof RoomServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};

export const getRoomMembersForGuest = async (
  roomId: string,
  guestId: string,
): Promise<{ room: RoomEntity; members: RoomMemberEntity[] }> => {
  const normalizedRoomId = assertRoomId(roomId);
  const normalizedGuestId = assertGuestId(guestId);

  try {
    const requesterMembershipRows = await supabaseRest<RoomMemberEntity[]>({
      endpoint: "room_members",
      method: "GET",
      query: {
        select: "id,room_id,guest_id,display_name,joined_at",
        room_id: `eq.${normalizedRoomId}`,
        guest_id: `eq.${normalizedGuestId}`,
        limit: 1,
      },
    });

    const requesterMembership = pickSingleRecord(requesterMembershipRows);

    if (!requesterMembership) {
      throw new RoomServiceError(
        "not_room_member",
        "You must join this room before viewing members.",
      );
    }

    const roomRows = await supabaseRest<RoomEntity[]>({
      endpoint: "rooms",
      method: "GET",
      query: {
        select: "id,room_name,passcode,created_by,created_at",
        id: `eq.${normalizedRoomId}`,
        limit: 1,
      },
    });

    const room = pickSingleRecord(roomRows);

    if (!room) {
      throw new RoomServiceError("room_not_found", "Room does not exist.");
    }

    const members = await supabaseRest<RoomMemberEntity[]>({
      endpoint: "room_members",
      method: "GET",
      query: {
        select: "id,room_id,guest_id,display_name,joined_at",
        room_id: `eq.${normalizedRoomId}`,
        order: "joined_at.asc",
      },
    });

    return {
      room,
      members,
    };
  } catch (error) {
    if (error instanceof RoomServiceError) {
      throw error;
    }

    throw mapSupabaseError(error);
  }
};
