import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.module.strictExportPresence = false;

    config.resolve.alias = {
      ...config.resolve.alias,
      "@tidecloak/react": path.resolve(
        __dirname,
        "node_modules/@tidecloak/react/dist/esm/index.js"
      ),
    };

    return config;
  },

  async rewrites() {
    return [
      {
        source: "/tide_dpop/:path*",
        destination: "/tide_dpop_auth.html",
      },
    ];
  },

  async headers() {
    // Order matters: when multiple entries match the same path, later entries
    // override duplicate header keys. Put the more-specific match LAST so the
    // /tide_dpop CSP wins over the global one.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src 'self' *",
          },
        ],
      },
      {
        source: "/tide_dpop/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'unsafe-inline'",
          },
          { key: "Allow-CSP-From", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
