import type { Metadata, Viewport } from "next";
import { Geist_Mono, Saira, Saira_Condensed } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/app/_components/app-providers";
import { version } from "@/package.json";

const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
});

const sairaCondensed = Saira_Condensed({
  variable: "--font-saira-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "DareBet",
  title: {
    default: "DareBet — World Cup Dares",
    template: "%s · DareBet",
  },
  description:
    "No-login room-based World Cup challenge platform. Create a room, vote on matches with friends, and the losers do the dare.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DareBet",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#050913",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Let the night-match background extend under the notch / home indicator
  // on installed iOS PWAs while keeping content within the safe area.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="darebet"
      className={`${saira.variable} ${sairaCondensed.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
        <footer className="mt-auto py-4 text-center font-mono text-xs text-base-content/40">
          DareBet v{version}
        </footer>
      </body>
    </html>
  );
}
