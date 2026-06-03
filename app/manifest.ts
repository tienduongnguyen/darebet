import type { MetadataRoute } from "next";

// Web app manifest served at /manifest.webmanifest (App Router metadata route).
// Colors mirror the `darebet` daisyUI theme tokens (base-300 background) so the
// installed PWA chrome and splash screen blend with the in-app night-match look.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DareBet — World Cup Dares",
    short_name: "DareBet",
    description:
      "No-login room-based World Cup challenge platform. Create a room, vote on matches with friends, and the losers do the dare.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#050913",
    theme_color: "#050913",
    categories: ["sports", "social", "games"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
