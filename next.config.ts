import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind CSS is small: inline it so the first paint does not wait for a stylesheet request
  experimental: { inlineCss: true },
  images: {
    // salon logos and cover photos from Supabase Storage
    remotePatterns: [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/salon-media/**`)],
    // only for a local Supabase stand-in during development; production stays blocked
    dangerouslyAllowLocalIP: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http://localhost")),
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // private and token pages stay out of search results
      ...["/dashboard/:path*", "/storno/:path*", "/gutschein/:path*", "/abmelden/:path*", "/bezahlt", "/passwort"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
