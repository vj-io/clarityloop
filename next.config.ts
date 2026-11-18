import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // ClarityLoop never asks for location or camera. The microphone is asked for only when the user taps a
        // mic button (speak instead of type); the browser's speech service turns it into text, ClarityLoop stores no audio.
        { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(self)" },
      ],
    }];
  },
};

export default nextConfig;
