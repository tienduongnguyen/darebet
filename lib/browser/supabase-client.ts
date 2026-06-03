"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env/public";

/**
 * Lazily-created browser Supabase client used only for Realtime
 * subscriptions. All data reads/writes still flow through the authenticated
 * server REST routes; this client never persists a session and starts on the
 * anon key. A per-guest JWT is applied later via `realtime.setAuth()`.
 */

let client: SupabaseClient | null = null;

export const getBrowserSupabaseClient = (): SupabaseClient => {
  if (client) {
    return client;
  }

  client = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    },
  );

  return client;
};
