import type { NextConfig } from "next";

// Baseline security headers. The CSP blocks framing (clickjacking), plugins,
// <base> hijacking and off-site form posts without restricting scripts, so
// Next's inline bootstrap and Vercel Analytics keep working.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" +
      (process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : ""),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never tell other sites which Privi page (e.g. an order) a link came from.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The audit report PDF is embedded on /security-audit: allow same-origin framing only.
      {
        source: "/security/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The Privacy Rings SDK loads a WebAssembly Poseidon hasher at runtime;
  // let Node require these packages instead of bundling them.
  serverExternalPackages: ["@heliuslabs/spr", "@lightprotocol/hasher.rs"],
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
