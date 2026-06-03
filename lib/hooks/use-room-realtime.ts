"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getBrowserSupabaseClient } from "@/lib/browser/supabase-client";

/**
 * Subscribes a room dashboard to live changes on `room_members`, `challenges`,
 * and `challenge_votes`. Realtime is authorised with a per-guest JWT minted by
 * `/api/realtime-token` so the websocket connection satisfies the room-scoped
 * RLS policies.
 *
 * Events are coalesced into a single debounced `onReconcile()` call rather than
 * mutating client state from partial WAL rows — this keeps server-side joins
 * (display names, match data) and the derived leaderboard correct. When the
 * server has no JWT secret configured, the hook degrades to interval polling so
 * the dashboard still stays reasonably fresh.
 */

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "polling"
  | "offline";

interface UseRoomRealtimeOptions {
  roomId: string;
  guestId: string | undefined;
  /** Authoritative, silent refetch of room data. */
  onReconcile: () => void;
}

const RECONCILE_DEBOUNCE_MS = 400;
const POLL_INTERVAL_MS = 15_000;
// Refresh the realtime token this long before it expires.
const TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

interface MintedToken {
  token: string;
  expiresAt: number;
}

const fetchRealtimeToken = async (
  guestId: string,
): Promise<MintedToken | null> => {
  const response = await fetch("/api/realtime-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId }),
  });

  if (!response.ok) {
    // 503 => realtime disabled on the server; any other error is transient.
    return null;
  }

  return (await response.json()) as MintedToken;
};

export const useRoomRealtime = ({
  roomId,
  guestId,
  onReconcile,
}: UseRoomRealtimeOptions): { status: RealtimeConnectionStatus } => {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("idle");

  // Keep the latest callback without re-running the subscription effect.
  const onReconcileRef = useRef(onReconcile);
  useEffect(() => {
    onReconcileRef.current = onReconcile;
  }, [onReconcile]);

  useEffect(() => {
    if (!guestId || !roomId) {
      return;
    }

    let isActive = true;
    let channel: RealtimeChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnectedOnce = false;

    const scheduleReconcile = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        onReconcileRef.current();
      }, RECONCILE_DEBOUNCE_MS);
    };

    const startPolling = () => {
      if (pollTimer || !isActive) {
        return;
      }
      setStatus("polling");
      pollTimer = setInterval(() => {
        onReconcileRef.current();
      }, POLL_INTERVAL_MS);
    };

    const scheduleTokenRefresh = (expiresAt: number) => {
      const delay = Math.max(
        15_000,
        expiresAt * 1000 - Date.now() - TOKEN_REFRESH_LEEWAY_MS,
      );
      refreshTimer = setTimeout(() => {
        void refreshAuth();
      }, delay);
    };

    const refreshAuth = async () => {
      if (!isActive) {
        return;
      }
      const minted = await fetchRealtimeToken(guestId);
      if (!isActive || !minted) {
        return;
      }
      const client = getBrowserSupabaseClient();
      await client.realtime.setAuth(minted.token);
      scheduleTokenRefresh(minted.expiresAt);
    };

    const connect = async () => {
      setStatus("connecting");

      const minted = await fetchRealtimeToken(guestId);

      if (!isActive) {
        return;
      }

      if (!minted) {
        startPolling();
        return;
      }

      const client = getBrowserSupabaseClient();
      await client.realtime.setAuth(minted.token);

      if (!isActive) {
        return;
      }

      scheduleTokenRefresh(minted.expiresAt);

      channel = client.channel(`room:${roomId}`, {
        config: { private: false },
      });

      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "room_members",
            filter: `room_id=eq.${roomId}`,
          },
          scheduleReconcile,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "challenges",
            filter: `room_id=eq.${roomId}`,
          },
          scheduleReconcile,
        )
        .on(
          "postgres_changes",
          {
            // challenge_votes has no room_id column; RLS already scopes events
            // to challenges in rooms this guest belongs to.
            event: "*",
            schema: "public",
            table: "challenge_votes",
          },
          scheduleReconcile,
        )
        .subscribe((channelStatus) => {
          if (!isActive) {
            return;
          }

          if (channelStatus === "SUBSCRIBED") {
            setStatus("live");
            // Re-subscribe after a drop: resync any changes missed offline.
            if (hasConnectedOnce) {
              onReconcileRef.current();
            }
            hasConnectedOnce = true;
            return;
          }

          if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT"
          ) {
            setStatus("reconnecting");
          }
        });
    };

    // Resync when the browser regains connectivity or the tab is refocused —
    // websocket reconnects can lag behind real network state.
    const handleOnline = () => {
      onReconcileRef.current();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        onReconcileRef.current();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    void connect();

    return () => {
      isActive = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      if (channel) {
        void getBrowserSupabaseClient().removeChannel(channel);
      }
    };
  }, [roomId, guestId]);

  return { status };
};
