import type { MetadataRoute } from "next";

// Add to a phone's home screen. No service worker: the app needs a connection and does not claim to work offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClarityLoop",
    short_name: "ClarityLoop",
    description: "Work chat where each person reads in their own language, and every instruction gets a meaning check.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0ede8",
    theme_color: "#f0ede8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
