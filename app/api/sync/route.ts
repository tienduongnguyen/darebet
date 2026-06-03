import { NextResponse } from "next/server";

import { runOnDemandSync } from "@/lib/server/sync-service";

// User-triggered refresh endpoint. Internally throttled (see runOnDemandSync),
// so repeated calls within the cooldown window return without hitting the
// Odds API. No cron, no secret — quota is protected by the cooldown.
export async function POST() {
  try {
    const result = await runOnDemandSync();

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { ran: false, error: "Sync failed." },
      { status: 500 },
    );
  }
}
