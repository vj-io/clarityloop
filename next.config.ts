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
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // ClarityLoop never asks for location, camera or microphone.
        { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
      ],
    }];
  },
};

export default nextConfig;
