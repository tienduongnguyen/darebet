"use client";

import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { LanguageProvider } from "@/lib/i18n/context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <LanguageSwitcher />
      {children}
    </LanguageProvider>
  );
}
