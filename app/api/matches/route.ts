import { NextResponse } from "next/server";

import { getMatchFeed } from "@/lib/server/challenges-service";

export async function GET() {
  try {
    const matches = await getMatchFeed();

    return NextResponse.json(
      {
        matches,
      },
      {
        status: 200,
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Could not load match feed right now.",
      },
      {
        status: 500,
      },
    );
  }
}
