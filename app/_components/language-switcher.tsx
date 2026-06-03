"use client";

import { useI18n } from "@/lib/i18n/context";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="fixed right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-50">
      <div
        role="group"
        aria-label={t("lang.label")}
        className="join shadow-lg ring-1 ring-base-content/10"
      >
        <button
          type="button"
          onClick={() => setLocale("vi")}
          aria-pressed={locale === "vi"}
          className={`btn btn-xs join-item ${locale === "vi" ? "btn-primary" : "btn-neutral"}`}
        >
          VI
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          aria-pressed={locale === "en"}
          className={`btn btn-xs join-item ${locale === "en" ? "btn-primary" : "btn-neutral"}`}
        >
          EN
        </button>
      </div>
    </div>
  );
}
