"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { messages, type Locale, type MessageKey } from "./messages";

const LOCALE_STORAGE_KEY = "darebet_locale";

export const SUPPORTED_LOCALES: Locale[] = ["en", "vi"];

type InterpolationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, params?: InterpolationParams) => string;
  formatDateTime: (iso: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const isLocale = (value: string | null): value is Locale =>
  value === "en" || value === "vi";

// Browsers report e.g. "vi", "vi-VN", "en-US". We only ship two locales, so a
// prefix check is enough.
const detectBrowserLocale = (): Locale => {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return (navigator.language ?? "").toLowerCase().startsWith("vi") ? "vi" : "en";
};

const interpolate = (
  template: string,
  params?: InterpolationParams,
): string => {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];

    return value === undefined ? match : String(value);
  });
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start with a server-safe default so the first client paint matches the
  // server output; the real preference is resolved after mount, mirroring the
  // guest-identity bootstrap pattern.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // Defer the read to the next tick so we never call setState synchronously
    // inside the effect body, mirroring the guest-identity bootstrap pattern.
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
        setLocaleState(isLocale(stored) ? stored : detectBrowserLocale());
      } catch {
        setLocaleState(detectBrowserLocale());
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);

    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (private mode, disabled storage).
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: InterpolationParams): string => {
      const template = messages[locale][key] ?? messages.en[key] ?? key;

      return interpolate(template, params);
    },
    [locale],
  );

  const formatDateTime = useCallback(
    (iso: string): string =>
      new Date(iso).toLocaleString(locale === "vi" ? "vi-VN" : "en-US"),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, formatDateTime }),
    [locale, setLocale, t, formatDateTime],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }

  return context;
}
