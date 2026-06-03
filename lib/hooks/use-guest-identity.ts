"use client";

import { useCallback, useEffect, useState } from "react";

import { isUuid, sanitizeText } from "@/lib/validation/common";

const GUEST_PROFILE_STORAGE_KEY = "darebet_guest_profile";

export interface GuestIdentity {
  guest_id: string;
  display_name: string;
}

const createUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Non-secure contexts (e.g. LAN IP) may throw; fallback below
    }
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const nextValue = char === "x" ? random : (random & 0x3) | 0x8;

    return nextValue.toString(16);
  });
};

const parseStoredGuestProfile = (raw: string | null): GuestIdentity | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GuestIdentity>;

    if (typeof parsed.guest_id !== "string" || !isUuid(parsed.guest_id)) {
      return null;
    }

    return {
      guest_id: parsed.guest_id,
      display_name:
        typeof parsed.display_name === "string"
          ? sanitizeText(parsed.display_name)
          : "",
    };
  } catch {
    return null;
  }
};

const writeProfile = (profile: GuestIdentity): void => {
  localStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile));
};

export const useGuestIdentity = () => {
  const [profile, setProfile] = useState<GuestIdentity | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const storedProfile = parseStoredGuestProfile(
          localStorage.getItem(GUEST_PROFILE_STORAGE_KEY),
        );

        if (storedProfile) {
          writeProfile(storedProfile);
          setProfile(storedProfile);
          return;
        }

        const freshProfile: GuestIdentity = {
          guest_id: createUuid(),
          display_name: "",
        };

        writeProfile(freshProfile);
        setProfile(freshProfile);
      } catch (error) {
        console.error("[use-guest-identity] bootstrap failed:", error);
        const fallbackProfile: GuestIdentity = {
          guest_id: createUuid(),
          display_name: "",
        };
        setProfile(fallbackProfile);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const updateDisplayName = useCallback(
    (nextDisplayName: string): GuestIdentity | null => {
      const normalizedDisplayName = sanitizeText(nextDisplayName);

      if (!normalizedDisplayName) {
        return null;
      }

      const sourceProfile =
        profile ??
        ({
          guest_id: createUuid(),
          display_name: "",
        } satisfies GuestIdentity);

      const nextProfile: GuestIdentity = {
        ...sourceProfile,
        display_name: normalizedDisplayName,
      };

      writeProfile(nextProfile);
      setProfile(nextProfile);

      return nextProfile;
    },
    [profile],
  );

  return {
    profile,
    isBootstrapping: profile === null,
    updateDisplayName,
  };
};
