import "server-only";

/**
 * Best-effort, in-memory room-creation rate limiter keyed by client IP.
 *
 * Limit: 1 room per IP per rolling 24h window.
 *
 * IMPORTANT — serverless caveat: on Vercel this Map lives inside a single
 * function instance and is lost on cold start, and requests may be served by
 * different instances. It therefore does NOT reliably enforce the limit across
 * the whole fleet. For hard enforcement, back this with a shared store
 * (Upstash Redis / Vercel KV) exposing the same check/record API.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24h
const MAX_ENTRIES = 10_000; // safety cap so the Map can't grow unbounded

const lastCreationByIp = new Map<string, number>();

/** Extract the client IP from proxy headers (Vercel sets x-forwarded-for). */
export const getClientIp = (headers: Headers): string | null => {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  return headers.get("x-real-ip");
};

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the IP may create another room (0 when allowed). */
  retryAfterSeconds: number;
}

export const checkRoomCreation = (ip: string): RateLimitVerdict => {
  const now = Date.now();
  const last = lastCreationByIp.get(ip);

  if (last !== undefined && now - last < WINDOW_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - last)) / 1000),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
};

export const recordRoomCreation = (ip: string): void => {
  const now = Date.now();

  // Opportunistically prune expired entries when the map gets large.
  if (lastCreationByIp.size >= MAX_ENTRIES) {
    for (const [key, timestamp] of lastCreationByIp) {
      if (now - timestamp >= WINDOW_MS) {
        lastCreationByIp.delete(key);
      }
    }
  }

  lastCreationByIp.set(ip, now);
};
