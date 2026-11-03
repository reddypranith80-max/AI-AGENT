import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Monorepo: one .env at the repo root is shared by the web app and the worker.
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", console, true); // forceReload: Next already loaded (empty) apps/web env

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@fh/api", "@fh/db", "@fh/domain", "@fh/providers", "@fh/emails"],
  // Native / Node-only modules must not be bundled.
  serverExternalPackages: ["@prisma/client", "ioredis", "bullmq", "@react-email/render", "react-dom/server"],
  poweredByHeader: false,
  webpack(config, { isServer }) {
    // bullmq optionally supports the Valkey Glide client; we use ioredis, so don't try to bundle it.
    if (isServer) config.externals = [...(config.externals ?? []), "@valkey/valkey-glide"];
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default config;
