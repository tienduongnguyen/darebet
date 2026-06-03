import { NextResponse } from "next/server";

import { mintRealtimeToken } from "@/lib/server/realtime-token";
import { isUuid } from "@/lib/validation/common";

interface RealtimeTokenPayload {
  guestId?: unknown;
}

export async function POST(request: Request) {
  let payload: RealtimeTokenPayload;

  try {
    payload = (await request.json()) as RealtimeTokenPayload;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof payload.guestId !== "string" || !isUuid(payload.guestId)) {
    return NextResponse.json(
      { error: "A valid guestId is required." },
      { status: 400 },
    );
  }

  const minted = mintRealtimeToken(payload.guestId);

  if (!minted) {
    // No JWT secret configured: realtime is unavailable, clients poll instead.
    return NextResponse.json(
      {
        error: "Realtime is not configured on this server.",
        code: "realtime_disabled",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(minted, { status: 200 });
}
