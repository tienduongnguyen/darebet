import "server-only";

import { createHmac } from "crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * Mints a short-lived HS256 JWT that authenticates a guest to Supabase
 * Realtime. The token carries a `guest_id` claim so the database function
 * `public.request_guest_id()` (which reads `auth.jwt() ->> 'guest_id'`) can
 * evaluate room-scoped RLS policies over the websocket connection.
 *
 * Returns `null` when no JWT secret is configured so callers can degrade to
 * polling instead of throwing.
 */

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

const base64Url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export interface RealtimeToken {
  token: string;
  /** Unix epoch seconds at which the token expires. */
  expiresAt: number;
}

export const mintRealtimeToken = (guestId: string): RealtimeToken | null => {
  const secret = serverEnv.SUPABASE_JWT_SECRET;

  if (!secret) {
    return null;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;

  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      // `authenticated` is the role Supabase grants signed-in users; RLS
      // policies still re-check `request_guest_id()` against room membership.
      role: "authenticated",
      aud: "authenticated",
      sub: guestId,
      guest_id: guestId,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = base64Url(
    createHmac("sha256", secret).update(signingInput).digest(),
  );

  return {
    token: `${signingInput}.${signature}`,
    expiresAt,
  };
};
